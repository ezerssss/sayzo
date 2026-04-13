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

const sessionAnalysisSchema = z.object({
    overview: z.string(),
    mainIssue: z.string(),
    secondaryIssues: z.array(z.string()),
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
    overview: z.string(),
    momentsToTighten: z.string(),
    structureAndFlow: z.string(),
    clarityAndConciseness: z.string(),
    relevanceAndFocus: z.string(),
    engagement: z.string(),
    professionalism: z.string(),
    deliveryAndProsody: z.string(),
    nativeSpeakerVersion: z.string().nullable(),
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

function parseTimestampToken(token: string): number | null {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(token);
    if (!m) return null;
    if (m[3] != null) {
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        const ss = Number(m[3]);
        return hh * 3600 + mm * 60 + ss;
    }
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    return mm * 60 + ss;
}

function extractTranscriptTimestampSeconds(transcript: string): Set<number> {
    const seconds = new Set<number>();
    const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(transcript)) !== null) {
        const stamp = hit[1];
        if (!stamp) continue;
        const parsed = parseTimestampToken(stamp);
        if (parsed != null) {
            seconds.add(parsed);
        }
    }
    return seconds;
}

function listTranscriptTimestampTokens(transcript: string, limit = 60): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const re = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(transcript)) !== null) {
        const token = hit[1];
        if (!token || seen.has(token)) continue;
        seen.add(token);
        out.push(token);
        if (out.length >= limit) break;
    }
    return out;
}

function sanitizeFeedbackTimestampLinks(
    markdown: string,
    validSeconds: Set<number>,
): string {
    let next = markdown.replaceAll(
        /\[(\d{1,2}:\d{2}(?::\d{2})?)\]\(time:(\d+)\)/g,
        (_full, stamp: string, secRaw: string) => {
            const fromStamp = parseTimestampToken(stamp);
            const fromLink = Number(secRaw);
            if (
                fromStamp == null ||
                !Number.isFinite(fromLink) ||
                fromStamp !== fromLink ||
                !validSeconds.has(fromLink)
            ) {
                return `[${stamp}]`;
            }
            return `[${stamp}](time:${fromLink})`;
        },
    );

    next = next.replaceAll(
        /\[(\d{1,2}:\d{2}(?::\d{2})?)\](?!\()/g,
        (_full, stamp: string) => {
            const seconds = parseTimestampToken(stamp);
            if (seconds == null || !validSeconds.has(seconds)) {
                return `[${stamp}]`;
            }
            return `[${stamp}](time:${seconds})`;
        },
    );

    return next;
}

function sanitizeFeedbackObjectTimestamps(
    feedback: SessionFeedbackType,
    validSeconds: Set<number>,
): SessionFeedbackType {
    return {
        ...feedback,
        overview: sanitizeFeedbackTimestampLinks(feedback.overview, validSeconds),
        momentsToTighten: sanitizeFeedbackTimestampLinks(
            feedback.momentsToTighten,
            validSeconds,
        ),
        structureAndFlow: sanitizeFeedbackTimestampLinks(
            feedback.structureAndFlow,
            validSeconds,
        ),
        clarityAndConciseness: sanitizeFeedbackTimestampLinks(
            feedback.clarityAndConciseness,
            validSeconds,
        ),
        relevanceAndFocus: sanitizeFeedbackTimestampLinks(
            feedback.relevanceAndFocus,
            validSeconds,
        ),
        engagement: sanitizeFeedbackTimestampLinks(feedback.engagement, validSeconds),
        professionalism: sanitizeFeedbackTimestampLinks(
            feedback.professionalism,
            validSeconds,
        ),
        deliveryAndProsody: sanitizeFeedbackTimestampLinks(
            feedback.deliveryAndProsody,
            validSeconds,
        ),
        nativeSpeakerVersion: feedback.nativeSpeakerVersion,
    };
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
- Situation context: ${session.plan.scenario.situationContext || "(none)"}
- Given content: ${session.plan.scenario.givenContent || "(none)"}
- Framework: ${session.plan.scenario.framework || "(none)"}
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
): Promise<SessionAnalysisType> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-analysis.md");
    const userContent = buildContextUserMessage(input, replay);

    const result = await generateText({
        model: openai(defaultAnalyzerModel()),
        output: Output.object({
            schema: zodSchema(sessionAnalysisSchema),
            name: "SessionAnalysis",
            description:
                "Structured analysis of one spoken professional-English practice session.",
        }),
        system,
        prompt: userContent,
        temperature: 0.2,
    });

    return result.output;
}

/**
 * Coach-style markdown feedback for the learner — maps to `SessionType.feedback`.
 *
 * When `replay` is provided, the feedback becomes comparison-focused: the LLM
 * sees the original capture and frames coaching as relative to the original.
 */
export async function generateSessionFeedback(
    input: AnalyzerInput,
    options: GenerateSessionFeedbackOptions = {},
    replay?: ReplayContext,
): Promise<SessionFeedbackType> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-feedback.md");
    const context = buildContextUserMessage(input, replay);
    const transcriptTimestamps = listTranscriptTimestampTokens(
        input.session.transcript,
    );
    const timestampGuidance =
        transcriptTimestamps.length > 0
            ? `\n\n## Transcript timestamps available\nUse these exact tokens when citing moments: ${transcriptTimestamps.join(", ")}`
            : "\n\n## Transcript timestamps available\nNone. Do not include timestamp links.";
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
                "Structured learner-facing coaching feedback with nuanced communication dimensions.",
        }),
        system,
        prompt: `${context}${timestampGuidance}${analysisBlock}`,
        temperature: 0.35,
    });

    const validSeconds = extractTranscriptTimestampSeconds(
        input.session.transcript,
    );
    return sanitizeFeedbackObjectTimestamps(result.output, validSeconds);
}
