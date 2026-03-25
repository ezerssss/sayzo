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
        "role" | "industry" | "goals" | "additionalContext"
    >;
    skillMemory: Pick<
        SkillMemoryType,
        "strengths" | "weaknesses" | "recentFocus"
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

function buildContextUserMessage(input: AnalyzerInput): string {
    const { userProfile, skillMemory, session } = input;
    const hume = session.humeContext?.trim();

    return `
## User profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Skill memory
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Recent focus: ${skillMemory.recentFocus.length ? skillMemory.recentFocus.join("; ") : "(none)"}

## Session plan
- Scenario title: ${session.plan.scenario.title || "(none)"}
- Situation context: ${session.plan.scenario.situationContext || "(none)"}
- Given content: ${session.plan.scenario.givenContent || "(none)"}
- Task: ${session.plan.scenario.task || "(none)"}
- Focus: ${session.plan.focus.length ? session.plan.focus.join("; ") : "(none)"}

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

    return text.trim();
}
