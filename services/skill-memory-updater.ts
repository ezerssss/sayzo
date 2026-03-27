import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionAnalysisType, SessionFeedbackType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";

const PROMPTS_DIR = join(process.cwd(), "prompts", "skill-memory-updater");

const skillMemoryPatchSchema = z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    masteredFocus: z.array(z.string()),
    reinforcementFocus: z.array(z.string()),
});

export type SkillMemoryUpdaterInput = {
    skillMemory: Pick<
        SkillMemoryType,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >;
    latestSession: {
        completionStatus?: "pending" | "passed" | "needs_retry";
        completionReason?: string | null;
        analysis: SessionAnalysisType;
        feedback: SessionFeedbackType;
        skillTarget?: string;
        framework?: string;
    };
};

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "update-memory.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.SKILL_MEMORY_UPDATER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function buildUserMessage(input: SkillMemoryUpdaterInput): string {
    const feedbackText = [
        "## Overview",
        input.latestSession.feedback.overview,
        "",
        "## Moments to tighten",
        input.latestSession.feedback.momentsToTighten,
        "",
        "## Structure and flow",
        input.latestSession.feedback.structureAndFlow,
        "",
        "## Clarity and conciseness",
        input.latestSession.feedback.clarityAndConciseness,
        "",
        "## Relevance and focus",
        input.latestSession.feedback.relevanceAndFocus,
        "",
        "## Engagement",
        input.latestSession.feedback.engagement,
        "",
        "## Professionalism",
        input.latestSession.feedback.professionalism,
        "",
        "## Delivery and prosody",
        input.latestSession.feedback.deliveryAndProsody,
        "",
        "## Better options",
        input.latestSession.feedback.betterOptions ?? "(none)",
        "",
        "## Next repetition",
        input.latestSession.feedback.nextRepetition,
        "",
        "## What worked well",
        input.latestSession.feedback.whatWorkedWell ?? "(none)",
    ]
        .join("\n")
        .trim();

    return `
## Current skill memory
- Strengths: ${input.skillMemory.strengths.length ? input.skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${input.skillMemory.weaknesses.length ? input.skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${input.skillMemory.masteredFocus.length ? input.skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${input.skillMemory.reinforcementFocus.length ? input.skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Latest session context
- Completion status: ${input.latestSession.completionStatus?.trim() || "(unknown)"}
- Completion reason: ${input.latestSession.completionReason?.trim() || "(none)"}
- Skill target: ${input.latestSession.skillTarget?.trim() || "(none)"}
- Framework: ${input.latestSession.framework?.trim() || "(none)"}

## Latest session analysis
\`\`\`json
${JSON.stringify(input.latestSession.analysis, null, 2)}
\`\`\`

## Latest session feedback
${feedbackText}
`.trim();
}

function normalizeItems(values: string[], limit: number): string[] {
    return Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        ),
    ).slice(0, limit);
}

export async function updateSkillMemoryFromLatestSession(
    input: SkillMemoryUpdaterInput,
): Promise<
    Pick<
        SkillMemoryType,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >
> {
    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(skillMemoryPatchSchema),
            name: "SkillMemoryPatch",
            description:
                "Updated strengths, weaknesses, and progression priorities after the latest completed session.",
        }),
        system: readPrompt(),
        prompt: buildUserMessage(input),
        temperature: 0.2,
    });

    return {
        strengths: normalizeItems(result.output.strengths, 8),
        weaknesses: normalizeItems(result.output.weaknesses, 8),
        masteredFocus: normalizeItems(result.output.masteredFocus, 8),
        reinforcementFocus: normalizeItems(result.output.reinforcementFocus, 5),
    };
}
