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
    isEnglish: z.boolean(),
    rejectionReason: z.string().nullable(),
});

type ValidationResult = {
    accepted: boolean;
    rejectionReason: string | null;
};

const NON_ENGLISH_REJECTION =
    "Conversation was not in English. Sayzo currently analyzes English conversations only.";

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

    const {
        isRelevant,
        isOrganic,
        hasSubstance,
        isEnglish,
        rejectionReason,
    } = result.output;
    const accepted = isRelevant && isOrganic && hasSubstance && isEnglish;

    if (accepted) {
        return { accepted: true, rejectionReason: null };
    }

    // Non-English overrides any other rejection reason — it's the most
    // actionable feedback ("we only support English"), and the LLM may have
    // populated `rejectionReason` with a generic relevance complaint.
    if (!isEnglish) {
        return { accepted: false, rejectionReason: NON_ENGLISH_REJECTION };
    }

    return {
        accepted: false,
        rejectionReason:
            rejectionReason ?? "Conversation did not meet relevance criteria",
    };
}
