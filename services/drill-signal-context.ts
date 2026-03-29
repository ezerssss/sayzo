import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionPlanType } from "@/types/sessions";

const PROMPTS_DIR = join(process.cwd(), "prompts", "learner-context-updater");

const MAX_INTERNAL_DRILL_SIGNAL_NOTES_CHARS = 5_500;

const outputSchema = z.object({
    internalDrillSignalNotes: z
        .string()
        .max(MAX_INTERNAL_DRILL_SIGNAL_NOTES_CHARS)
        .describe(
            "Merged backend-only drill preference notes from skip/reflection signals.",
        ),
});

export type DrillSignalKind = "skip" | "post_drill_reflection";

export type MergeDrillSignalInput = {
    previousInternalDrillSignalNotes: string;
    plan: SessionPlanType;
    kind: DrillSignalKind;
    /** Raw user words from voice (transcribed) and/or typed text; may be empty. */
    signalTranscript: string;
    /** User chose not to share any reason or reflection. */
    declinedToShare: boolean;
    /** Reflections: title of the drill they are commenting on. */
    priorDrillTitle?: string;
};

function readPrompt(): string {
    return readFileSync(
        join(PROMPTS_DIR, "merge-drill-signal.md"),
        "utf-8",
    );
}

function defaultModel(): string {
    return (
        process.env.LEARNER_CONTEXT_UPDATER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function buildUserMessage(input: MergeDrillSignalInput): string {
    const prior =
        input.priorDrillTitle?.trim() ||
        (input.kind === "post_drill_reflection" ? "(not provided)" : "N/A");
    const transcript = input.signalTranscript.trim() || "(empty)";
    return `
## Previous internal drill signal notes
${input.previousInternalDrillSignalNotes.trim() || "(empty)"}

## Signal kind
${input.kind}

## Drill plan (for grounding — skipped drill or prior drill under reflection)
- Category: ${input.plan.scenario.category}
- Title: ${input.plan.scenario.title}
- Situation: ${input.plan.scenario.situationContext}
- Skill target: ${input.plan.skillTarget}

## Prior drill title (reflections only; else N/A)
${prior}

## Declined to share
${input.declinedToShare ? "yes" : "no"}

## Signal transcript (spoken and/or typed)
${transcript}
`.trim();
}

/**
 * Merges skip/reflection signals into persisted internal drill signal notes (not transcript learner context).
 */
export async function mergeInternalDrillSignalNotes(
    input: MergeDrillSignalInput,
): Promise<{ internalDrillSignalNotes: string }> {
    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(outputSchema),
            name: "DrillSignalNotes",
            description:
                "Updated backend-only drill preference notes after a skip or reflection signal.",
        }),
        system: readPrompt(),
        prompt: buildUserMessage(input),
        temperature: 0.15,
    });

    return {
        internalDrillSignalNotes: result.output.internalDrillSignalNotes.trim(),
    };
}
