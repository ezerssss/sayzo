import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { CaptureTranscriptLine } from "@/types/captures";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

const validationSchema = z.object({
    isRelevant: z.boolean(),
    isOrganic: z.boolean(),
    hasSubstance: z.boolean(),
    rejectionReason: z.string().nullable(),
});

type ValidationResult = {
    accepted: boolean;
    rejectionReason: string | null;
};

function readPrompt(): string {
    return readFileSync(
        join(PROMPTS_DIR, "relevance-validation.md"),
        "utf-8",
    );
}

function defaultModel(): string {
    return (
        process.env.CAPTURE_ANALYZER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function formatTranscript(transcript: CaptureTranscriptLine[]): string {
    return transcript
        .map(
            (line) =>
                `[${line.start.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");
}

export async function validateCaptureRelevance(
    transcript: CaptureTranscriptLine[],
    title: string,
    summary: string,
): Promise<ValidationResult> {
    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(validationSchema),
            name: "CaptureRelevanceValidation",
            description:
                "Validates whether a captured conversation is relevant for English coaching.",
        }),
        system: readPrompt(),
        prompt: `## Title\n${title}\n\n## Summary\n${summary}\n\n## Transcript\n${formatTranscript(transcript)}`,
        temperature: 0,
    });

    const { isRelevant, isOrganic, hasSubstance, rejectionReason } =
        result.output;
    const accepted = isRelevant && isOrganic && hasSubstance;

    return {
        accepted,
        rejectionReason: accepted
            ? null
            : (rejectionReason ??
              "Conversation did not meet relevance criteria"),
    };
}
