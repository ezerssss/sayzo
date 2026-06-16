import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionPlanType, SessionType } from "@/schemas";
import { runInstrumentedLLM } from "@/lib/llm/instrument";
import { loadModelPrompt } from "@/lib/openai/prompt";
import { temperatureOptions } from "@/lib/openai/reasoning";

const PROMPTS_DIR = join(process.cwd(), "prompts", "learner-context-updater");

const MAX_DRILL_NOTES_CHARS = 5_500;
const MAX_TRANSCRIPT_CHARS_IN_PROMPT = 14_000;

const drillNotesOutputSchema = z.object({
    drillNotes: z
        .string()
        .max(MAX_DRILL_NOTES_CHARS)
        .describe(
            "Merged backend-only bullet notes for future drill personalization.",
        ),
});

export type LearnerContextUpdaterInput = {
    previousDrillNotes: string;
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
## Previous drill notes
${input.previousDrillNotes.trim() || "(empty)"}

## This session drill (for grounding)
- Category: ${plan.scenario.category}
- Title: ${plan.scenario.title}
- Question: ${plan.scenario.question}
- Skill target: ${plan.skillTarget}
- Completion status: ${completionStatus}

## Transcript
${transcriptBlock}
`.trim();
}

/**
 * Merges evidence from one session transcript into the persisted drill notes
 * (`learner-models/{uid}.context.drillNotes`). Call only from trusted server
 * code; the output is backend-only and never user-facing.
 */
export async function mergeDrillNotesFromSession(
    input: LearnerContextUpdaterInput,
): Promise<{ drillNotes: string }> {
    const modelName = defaultModel();
    const system = loadModelPrompt(readPrompt(), modelName);
    const { result } = await runInstrumentedLLM({
        promptKey: "learner.context_update",
        model: modelName,
        promptParts: { system },
        call: () =>
            generateText({
                model: openai(modelName),
                output: Output.object({
                    schema: zodSchema(drillNotesOutputSchema),
                    name: "DrillNotes",
                    description:
                        "Updated backend-only learner notes for drill personalization.",
                }),
                system,
                prompt: buildUserMessage(input),
                ...temperatureOptions(modelName, 0.15),
            }),
    });

    return {
        drillNotes: result.output.drillNotes.trim(),
    };
}
