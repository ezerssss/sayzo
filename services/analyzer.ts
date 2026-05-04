import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
} from "@/types/captures";
import type {
    SessionAnalysisType,
    SessionFeedbackType,
    SessionPlanType,
} from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

/**
 * When the session is a scenario replay of a captured conversation, the
 * analyzer receives the original capture's data so it can produce
 * comparison-focused feedback ("compared to your original, you …").
 *
 * The source capture is **read-only** — the analyzer never writes back to it.
 */
export type ReplayContext = {
    sourceCapture: {
        title: string;
        summary: string;
        transcript: CaptureTranscriptLine[];
        analysis: CaptureAnalysis;
    };
};

const PROMPTS_DIR = join(process.cwd(), "prompts", "analyzer");

/**
 * LLM-facing teachable moment shape. `transcriptIdx` and `timestamp` are
 * deliberately absent — LLMs hallucinate numbers, so the server resolves
 * them deterministically from the verbatim `anchor` text via
 * `lib/transcripts/anchor-resolver`.
 */
const llmTeachableMomentSchema = z.object({
    anchor: z.string(),
    betterOption: z.string(),
    whyThisMatters: z.string(),
    type: z.enum([
        "grammar",
        "filler",
        "phrasing",
        "vocabulary",
        "communication",
    ]),
    severity: z.enum(["minor", "moderate", "major"]),
});

const sessionAnalysisSchema = z.object({
    overview: z.string(),
    mainIssue: z.string(),
    secondaryIssues: z.array(z.string()),
    /**
     * Specific evidence-anchored positive observation, or null. Only set
     * when the learner did something concrete worth noticing — never
     * generic praise. Most sessions will have null here.
     */
    whatWentWell: z.string().nullable(),
    /**
     * Top 0-3 ranked coaching moments. The user-facing feedback page
     * renders `slice(0, 2)` of this array as the "Fix these first" card.
     * Empty array is valid — when the response is clean, don't pad with
     * cosmetic fixes. Keep entries concrete: anchor (what they said),
     * betterOption (how to say it instead), whyThisMatters (cost +
     * reusable principle).
     */
    fixTheseFirst: z.array(llmTeachableMomentSchema),
    structureAndFlow: z.array(z.string()),
    clarityAndConciseness: z.array(z.string()),
    relevanceAndFocus: z.array(z.string()),
    engagement: z.array(z.string()),
    professionalism: z.array(z.string()),
    voiceToneExpression: z.array(z.string()),
    improvements: z.array(z.string()),
    regressions: z.array(z.string()),
    notes: z.string(),
});

/**
 * What `analyzeSession` actually returns: like `SessionAnalysisType` but
 * with `fixTheseFirst[]` missing the server-set `transcriptIdx` /
 * `timestamp` fields. The route fills those in via `reconcileMoments` to
 * produce the persisted `SessionAnalysisType`.
 */
export type LlmSessionAnalysis = Omit<SessionAnalysisType, "fixTheseFirst"> & {
    fixTheseFirst: z.infer<typeof llmTeachableMomentSchema>[];
};

export type AnalyzerInput = {
    userProfile: Pick<
        UserProfileType,
        | "role"
        | "industry"
        | "goals"
        | "companyName"
        | "companyDescription"
        | "workplaceCommunicationContext"
        | "wantsInterviewPractice"
        | "motivation"
        | "additionalContext"
        | "companyResearch"
    >;
    skillMemory: Pick<
        SkillMemoryType,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >;
    session: {
        plan: SessionPlanType;
        transcript: string;
        /** Hume AI prosody / expressive speech — JSON or a short summary from your pipeline */
        humeContext?: string | null;
    };
};

export type GenerateSessionFeedbackOptions = {
    /** When set, align priorities with structured analysis from `analyzeSession`. */
    sessionAnalysis?: SessionAnalysisType | null;
};

const sessionFeedbackSchema = z.object({
    improvedVersion: z.string().nullable(),
});

function readAnalyzerPrompt(filename: string): string {
    return readFileSync(join(PROMPTS_DIR, filename), "utf-8");
}

function defaultAnalyzerModel(): string {
    return process.env.ANALYZER_MODEL?.trim() || "gpt-4o-mini";
}

function requireTranscript(transcript: string): void {
    if (!transcript?.trim()) {
        throw new Error("Analyzer requires a non-empty session transcript.");
    }
}

function formatReplayContextBlock(replay: ReplayContext): string {
    const { sourceCapture } = replay;
    const analysis = sourceCapture.analysis;

    // Include only user-spoken lines from the original transcript for comparison
    const userLines = sourceCapture.transcript
        .filter((l) => l.speaker === "user")
        .map(
            (l) =>
                `[${l.start.toFixed(1)}s] ${l.text}`,
        )
        .join("\n");

    return `

## Original capture (this is a replay drill — compare against this)
Title: ${sourceCapture.title}
Summary: ${sourceCapture.summary}
Main issue identified in original: ${analysis.mainIssue}
Secondary issues: ${analysis.secondaryIssues.join("; ") || "(none)"}

### Original user turns (what the learner actually said in the real conversation)
${userLines || "(no user turns in original)"}

### Key dimensional assessments from original
- Structure & flow: ${analysis.structureAndFlow.assessment}
- Clarity & conciseness: ${analysis.clarityAndConciseness.assessment}
- Relevance & focus: ${analysis.relevanceAndFocus.assessment}
- Engagement: ${analysis.engagement.assessment}
- Professionalism: ${analysis.professionalism.assessment}
- Voice / tone / expression: ${analysis.voiceToneExpression.assessment}

### Original quantitative metrics
- Filler rate: ${analysis.fillerWords.perMinute.toFixed(1)}/min
- Speaking pace: ${analysis.fluency.wordsPerMinute} WPM
- Self-corrections: ${analysis.fluency.selfCorrections}
- Communication style: directness=${analysis.communicationStyle.directness.toFixed(2)}, formality=${analysis.communicationStyle.formality.toFixed(2)}, confidence=${analysis.communicationStyle.confidence.toFixed(2)}`;
}

function buildContextUserMessage(input: AnalyzerInput, replay?: ReplayContext): string {
    const { userProfile, skillMemory, session } = input;
    const hume = session.humeContext?.trim();

    return `
## User profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Company description: ${userProfile.companyDescription || "(not set)"}
- Communication context (work/interviews): ${userProfile.workplaceCommunicationContext || "(not set)"}
- Wants interview practice: ${userProfile.wantsInterviewPractice ? "yes" : "no"}
- Motivation: ${userProfile.motivation || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Skill memory
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${skillMemory.masteredFocus.length ? skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${skillMemory.reinforcementFocus.length ? skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Session plan
- Drill category: ${session.plan.scenario.category}
- Scenario title: ${session.plan.scenario.title || "(none)"}
- Question: ${session.plan.scenario.question || "(none)"}
- Skill target: ${session.plan.skillTarget || "(none)"}

## Session transcript
${session.transcript.trim()}

## Hume AI (prosody / expressive speech)
${hume ?? "(no payload for this run)"}
${replay ? formatReplayContextBlock(replay) : ""}
`.trim();
}

/**
 * Structured session analysis — maps to `SessionAnalysisType` for persistence.
 *
 * When `replay` is provided, the analysis becomes comparison-focused: the LLM
 * sees the original capture's transcript + analysis and frames findings as
 * "compared to your original, you …".
 */
export async function analyzeSession(
    input: AnalyzerInput,
    replay?: ReplayContext,
): Promise<LlmSessionAnalysis> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-analysis.md");
    const userContent = buildContextUserMessage(input, replay);

    const result = await generateText({
        model: openai(defaultAnalyzerModel()),
        output: Output.object({
            schema: zodSchema(sessionAnalysisSchema),
            name: "SessionAnalysis",
            description:
                "Structured analysis of one 60-second spoken practice session — main issue, ranked coaching moments (0-3), dimensional findings, and an optional what-went-well call-out.",
        }),
        system,
        prompt: userContent,
        temperature: 0.2,
    });

    return result.output;
}

/**
 * Polished rewrite for the learner — the "Improved Version" tab on the
 * feedback page. Single-field output (`improvedVersion`): a fluent native
 * speaker's version of the same response with `> **Note:**` annotations
 * after each paragraph explaining what changed and why.
 *
 * When `replay` is provided, the rewrite acknowledges what improved (or
 * didn't) compared to the original capture.
 */
export async function generateSessionFeedback(
    input: AnalyzerInput,
    options: GenerateSessionFeedbackOptions = {},
    replay?: ReplayContext,
): Promise<SessionFeedbackType> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-feedback.md");
    const context = buildContextUserMessage(input, replay);
    let analysisBlock = "";
    if (options.sessionAnalysis != null) {
        analysisBlock = `\n\n## Prior structured analysis (for alignment)\n\`\`\`json\n${JSON.stringify(options.sessionAnalysis, null, 2)}\n\`\`\``;
    }

    const result = await generateText({
        model: openai(defaultAnalyzerModel()),
        output: Output.object({
            schema: zodSchema(sessionFeedbackSchema),
            name: "SessionFeedback",
            description:
                "Polished native-speaker rewrite of the learner's drill response with per-paragraph change notes.",
        }),
        system,
        prompt: `${context}${analysisBlock}`,
        temperature: 0.35,
    });

    return result.output;
}
