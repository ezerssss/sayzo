import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { runInstrumentedLLM } from "@/lib/llm/instrument";
import type { CaptureTranscriptLine, LlmQualityOutcome } from "@/schemas";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

const validationSchema = z.object({
    isRelevant: z.boolean(),
    isOrganic: z.boolean(),
    hasSubstance: z.boolean(),
    hasCoachableEnglish: z.boolean(),
    rejectionReason: z.string().nullable(),
});

type ValidationResult = {
    accepted: boolean;
    rejectionReason: string | null;
};

const NO_COACHABLE_ENGLISH_REJECTION =
    "This conversation didn't have enough English speech from you for Sayzo to coach. Mixed-language conversations are fine — there just need to be a few English turns from you.";

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "relevance-validation.md"), "utf-8");
}

/**
 * Validation is a deterministic 4-boolean classification (relevant / organic /
 * substantive / coachable-English) at temperature 0 — mini handles it fine. Defaults to
 * `gpt-4o-mini` directly so bumping `CAPTURE_ANALYZER_MODEL` for the deep
 * synthesis call doesn't drag this cheap classification along with it.
 */
function defaultModel(): string {
    return process.env.CAPTURE_VALIDATOR_MODEL?.trim() || "gpt-4o-mini";
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
    refs?: { uid?: string | null; captureId?: string | null },
): Promise<ValidationResult> {
    const system = readPrompt();
    const modelName = defaultModel();
    const { result, finalize } = await runInstrumentedLLM({
        promptKey: "capture.validate",
        model: modelName,
        promptParts: { system },
        refs: { uid: refs?.uid ?? null, captureId: refs?.captureId ?? null },
        call: () =>
            generateText({
                model: openai(modelName),
                output: Output.object({
                    schema: zodSchema(validationSchema),
                    name: "CaptureRelevanceValidation",
                    description:
                        "Validates whether a captured conversation is relevant for English coaching.",
                }),
                system,
                prompt: `## Title\n${title}\n\n## Summary\n${summary}\n\n## Transcript\n${formatTranscript(transcript)}`,
                temperature: 0,
            }),
    });

    const {
        isRelevant,
        isOrganic,
        hasSubstance,
        hasCoachableEnglish,
        rejectionReason,
    } = result.output;
    const accepted =
        isRelevant && isOrganic && hasSubstance && hasCoachableEnglish;

    // Layer-2: record which relevance gate(s) failed (enums only, no transcript).
    const outcomes: LlmQualityOutcome[] = [];
    if (!isRelevant) outcomes.push("REJECTED_NOT_RELEVANT");
    if (!isOrganic) outcomes.push("REJECTED_NOT_ORGANIC");
    if (!hasSubstance) outcomes.push("REJECTED_NO_SUBSTANCE");
    if (!hasCoachableEnglish) outcomes.push("REJECTED_NO_COACHABLE_ENGLISH");
    finalize({ qualityOutcomes: outcomes });

    if (accepted) {
        return { accepted: true, rejectionReason: null };
    }

    // No-coachable-English overrides any other rejection reason — it's the
    // most actionable feedback ("speak some English and Sayzo can coach you"),
    // and the LLM may have populated `rejectionReason` with a generic
    // relevance complaint.
    if (!hasCoachableEnglish) {
        return {
            accepted: false,
            rejectionReason: NO_COACHABLE_ENGLISH_REJECTION,
        };
    }

    return {
        accepted: false,
        rejectionReason:
            rejectionReason ?? "Conversation did not meet relevance criteria",
    };
}
