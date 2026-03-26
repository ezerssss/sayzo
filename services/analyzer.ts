import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionAnalysisType, SessionPlanType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "analyzer");

const sessionAnalysisSchema = z.object({
    mainIssue: z.string(),
    secondaryIssues: z.array(z.string()),
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
    const m = token.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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

function linkifyFeedbackTimestamps(markdown: string): string {
    return markdown.replace(
        /\[(\d{1,2}:\d{2}(?::\d{2})?)\](?!\()/g,
        (_full, stamp: string) => {
            const seconds = parseTimestampToken(stamp);
            if (seconds == null) return `[${stamp}]`;
            return `[${stamp}](time:${seconds})`;
        },
    );
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
): Promise<string> {
    requireTranscript(input.session.transcript);

    const system = readAnalyzerPrompt("session-feedback.md");
    const context = buildContextUserMessage(input);
    let analysisBlock = "";
    if (options.sessionAnalysis != null) {
        analysisBlock = `\n\n## Prior structured analysis (for alignment)\n\`\`\`json\n${JSON.stringify(options.sessionAnalysis, null, 2)}\n\`\`\``;
    }

    const { text } = await generateText({
        model: openai(defaultAnalyzerModel()),
        system,
        prompt: `${context}${analysisBlock}`,
        temperature: 0.35,
    });

    return linkifyFeedbackTimestamps(text.trim());
}
