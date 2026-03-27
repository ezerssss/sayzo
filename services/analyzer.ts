import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    SessionAnalysisType,
    SessionFeedbackType,
    SessionPlanType,
} from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

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
    betterOptions: z.string().nullable(),
    nextRepetition: z.string(),
    whatWorkedWell: z.string().nullable(),
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
        betterOptions: feedback.betterOptions
            ? sanitizeFeedbackTimestampLinks(feedback.betterOptions, validSeconds)
            : null,
        nextRepetition: sanitizeFeedbackTimestampLinks(
            feedback.nextRepetition,
            validSeconds,
        ),
        whatWorkedWell: feedback.whatWorkedWell
            ? sanitizeFeedbackTimestampLinks(feedback.whatWorkedWell, validSeconds)
            : null,
    };
}

function buildContextUserMessage(input: AnalyzerInput): string {
    const { userProfile, skillMemory, session } = input;
    const hume = session.humeContext?.trim();

    return `
## User profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Company description: ${userProfile.companyDescription || "(not set)"}
- Workplace communication context: ${userProfile.workplaceCommunicationContext || "(not set)"}
- Motivation: ${userProfile.motivation || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Skill memory
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${skillMemory.masteredFocus.length ? skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${skillMemory.reinforcementFocus.length ? skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Session plan
- Scenario title: ${session.plan.scenario.title || "(none)"}
- Situation context: ${session.plan.scenario.situationContext || "(none)"}
- Given content: ${session.plan.scenario.givenContent || "(none)"}
- Framework: ${session.plan.scenario.framework || "(none)"}
- Skill target: ${session.plan.skillTarget || "(none)"}

## Session transcript
${session.transcript.trim()}

## Hume AI (prosody / expressive speech)
${hume ?? "(no payload for this run)"}
`.trim();
}

/**
 * Structured session analysis — maps to `SessionAnalysisType` for persistence.
 */
export async function analyzeSession(
    input: AnalyzerInput,
): Promise<SessionAnalysisType> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-analysis.md");
    const userContent = buildContextUserMessage(input);

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
 */
export async function generateSessionFeedback(
    input: AnalyzerInput,
    options: GenerateSessionFeedbackOptions = {},
): Promise<SessionFeedbackType> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-feedback.md");
    const context = buildContextUserMessage(input);
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
