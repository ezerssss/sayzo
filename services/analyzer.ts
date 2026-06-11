import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureTranscriptLine,
    ItemAnalysis,
    SessionFeedbackType,
    SessionPlanType,
} from "@/schemas";
import {
    dimensionalAnalysisSchema,
    llmTeachableMomentSchema,
    mainIssueShapeSchema,
} from "@/schemas";
import type { DifferentialContext } from "@/schemas";
import type { LearnerModel } from "@/schemas";
import type { UserProfileType } from "@/schemas";
import { formatDifferentialBlocks } from "@/lib/learner-model/format-differential";
import { loadModelPromptParts } from "@/lib/openai/prompt";
import { modelTuningOptions } from "@/lib/openai/reasoning";
import { sanitizeSpokenFields } from "@/lib/text/despeechify";

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
        analysis: ItemAnalysis;
    };
};

const PROMPTS_DIR = join(process.cwd(), "prompts", "analyzer");

const sessionAnalysisSchema = z.object({
    overview: z.string(),
    mainIssue: z.string(),
    /**
     * Transferable lesson the learner carries to their next attempt:
     * `principle` (the heuristic to internalize, one quotable line) +
     * `shape` (a 2-5 step skeleton showing how that principle takes form
     * for this drill, with `→` separators). Renders between MAIN ISSUE
     * and "Fix these first" — the three surfaces form a ladder
     * (diagnosis → principle → worked rewrite). Null when the response
     * was clean enough that no top fix earned a slot.
     */
    mainIssueShape: mainIssueShapeSchema.nullable(),
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
    structureAndFlow: dimensionalAnalysisSchema,
    clarityAndConciseness: dimensionalAnalysisSchema,
    relevanceAndFocus: dimensionalAnalysisSchema,
    engagement: dimensionalAnalysisSchema,
    professionalism: dimensionalAnalysisSchema,
    improvements: z.array(z.string()),
    regressions: z.array(z.string()),
    notes: z.string(),
});

/**
 * What `analyzeSession` actually returns: like `ItemAnalysis` but
 * with `fixTheseFirst[]` missing the server-set `transcriptIdx` /
 * `timestamp` fields. The route fills those in via `reconcileMoments` to
 * produce the persisted `ItemAnalysis`.
 */
export type LlmSessionAnalysis = Omit<ItemAnalysis, "fixTheseFirst"> & {
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
        LearnerModel,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >;
    /** History slice that makes feedback differential (tracked habits + recent headlines). */
    differential: DifferentialContext;
    session: {
        plan: SessionPlanType;
        transcript: string;
    };
};

export type GenerateSessionFeedbackOptions = {
    /** When set, align priorities with structured analysis from `analyzeSession`. */
    sessionAnalysis?: ItemAnalysis | null;
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

### Original quantitative metrics
- Filler rate: ${(analysis.fillerWords?.perMinute ?? 0).toFixed(1)}/min
- Speaking pace: ${analysis.fluency?.wordsPerMinute ?? 0} WPM
- Self-corrections: ${analysis.fluency?.selfCorrections ?? 0}
- Communication style: directness=${(analysis.communicationStyle?.directness ?? 0).toFixed(2)}, formality=${(analysis.communicationStyle?.formality ?? 0).toFixed(2)}, confidence=${(analysis.communicationStyle?.confidence ?? 0).toFixed(2)}`;
}

function buildContextUserMessage(input: AnalyzerInput, replay?: ReplayContext): string {
    const { userProfile, skillMemory, session, differential } = input;

    const { trackedBlock, recentIssuesBlock } =
        formatDifferentialBlocks(differential);

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

## Tracked habits (what we already know about this learner — be differential, don't re-headline these)
${trackedBlock}

## Recent main-issue headlines (newest first — do NOT repeat headline #1; acknowledge progress then redirect)
${recentIssuesBlock}

## Session plan
- Drill category: ${session.plan.scenario.category}
- Scenario title: ${session.plan.scenario.title || "(none)"}
- Question: ${session.plan.scenario.question || "(none)"}
- Skill target: ${session.plan.skillTarget || "(none)"}

## Session transcript
${session.transcript.trim()}
${replay ? formatReplayContextBlock(replay) : ""}
`.trim();
}

/**
 * Structured session analysis — maps to `ItemAnalysis` for persistence.
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

    const modelName = defaultAnalyzerModel();
    const promptParts = loadModelPromptParts(system, modelName);
    const result = await generateText({
        model: openai(modelName),
        output: Output.object({
            schema: zodSchema(sessionAnalysisSchema),
            name: "SessionAnalysis",
            description:
                "Structured analysis of one 60-second spoken practice session — main issue, ranked coaching moments (0-3), dimensional findings, and an optional what-went-well call-out.",
        }),
        system: promptParts.system,
        // Chat models get a short rule recap AFTER the transcript (late
        // instructions weigh heavier there); reasoning models get none.
        prompt: promptParts.postTranscriptRecap
            ? `${userContent}\n\n${promptParts.postTranscriptRecap}`
            : userContent,
        ...modelTuningOptions(modelName, {
            temperature: 0.2,
            // Extraction-style analysis over a short transcript — the
            // documented case for scaling reasoning effort down.
            reasoningEffort: "low",
            textVerbosity: "low",
        }),
    });

    // Floor: strip un-speakable punctuation from every `betterOption` (the
    // spoken "say it like this" target). See lib/text/despeechify.
    return sanitizeSpokenFields(result.output);
}

/**
 * Stronger rewrite for the learner — the "Improved Version" tab on the
 * feedback page. Single-field output (`improvedVersion`): the strongest
 * spoken version of the same response, in the drill scenario's register,
 * with `> **Note:**` annotations after each paragraph explaining what
 * changed and why.
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

    const modelName = defaultAnalyzerModel();
    const promptParts = loadModelPromptParts(system, modelName);
    const userContent = `${context}${analysisBlock}`;
    const result = await generateText({
        model: openai(modelName),
        output: Output.object({
            schema: zodSchema(sessionFeedbackSchema),
            name: "SessionFeedback",
            description:
                "Stronger spoken rewrite of the learner's drill response with per-paragraph change notes.",
        }),
        system: promptParts.system,
        prompt: promptParts.postTranscriptRecap
            ? `${userContent}\n\n${promptParts.postTranscriptRecap}`
            : userContent,
        ...modelTuningOptions(modelName, {
            temperature: 0.35,
            reasoningEffort: "low",
            // The rewrite is length-bound by the "same airtime" rule and the
            // Note annotations need room — medium, not low.
            textVerbosity: "medium",
        }),
    });

    // Floor: strip un-speakable punctuation from the spoken rewrite paragraphs
    // of `improvedVersion` (the `> **Note:**` coaching prose is left intact).
    return sanitizeSpokenFields(result.output);
}
