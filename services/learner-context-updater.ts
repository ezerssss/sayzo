import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionPlanType, SessionType } from "@/types/sessions";

const PROMPTS_DIR = join(process.cwd(), "prompts", "learner-context-updater");

const MAX_INTERNAL_LEARNER_CONTEXT_CHARS = 5_500;
const MAX_TRANSCRIPT_CHARS_IN_PROMPT = 14_000;

const learnerContextOutputSchema = z.object({
    internalLearnerContext: z
        .string()
        .max(MAX_INTERNAL_LEARNER_CONTEXT_CHARS)
        .describe(
            "Merged backend-only bullet notes for future drill personalization.",
        ),
});

export type LearnerContextUpdaterInput = {
    previousInternalLearnerContext: string;
    plan: SessionPlanType;
    transcript: string;
    completionStatus: SessionType["completionStatus"];
};

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "update-from-session.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.LEARNER_CONTEXT_UPDATER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function buildUserMessage(input: LearnerContextUpdaterInput): string {
    const { plan, transcript, completionStatus } = input;
    let transcriptBlock = transcript.trim();
    if (transcriptBlock.length > MAX_TRANSCRIPT_CHARS_IN_PROMPT) {
        transcriptBlock =
            transcriptBlock.slice(0, MAX_TRANSCRIPT_CHARS_IN_PROMPT) +
            "\n\n[Transcript truncated for this update.]";
    }

    return `
## Previous internal learner context
${input.previousInternalLearnerContext.trim() || "(empty)"}

## This session drill (for grounding)
- Category: ${plan.scenario.category}
- Title: ${plan.scenario.title}
- Situation: ${plan.scenario.situationContext}
- Skill target: ${plan.skillTarget}
- Completion status: ${completionStatus}

## Transcript
${transcriptBlock}
`.trim();
}

/**
 * Merges evidence from one session transcript into the persisted internal learner context.
 * Call only from trusted server code; output is never user-facing.
 */
export async function mergeInternalLearnerContextFromSession(
    input: LearnerContextUpdaterInput,
): Promise<{ internalLearnerContext: string }> {
    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(learnerContextOutputSchema),
            name: "InternalLearnerContext",
            description:
                "Updated backend-only learner notes for drill personalization.",
        }),
        system: readPrompt(),
        prompt: buildUserMessage(input),
        temperature: 0.15,
    });

    return {
        internalLearnerContext: result.output.internalLearnerContext.trim(),
    };
}
