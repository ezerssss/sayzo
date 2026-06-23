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

/**
 * Final accept decision from the four relevance flags. One-sided captures
 * (only the user's mic carried speech) drop ONLY the `isOrganic` gate — a
 * phone call where only the mic was on, or deliberate solo practice, are both
 * valid, so a rehearsed/unscripted monologue is fine. `isRelevant` is KEPT but
 * carries a one-sided-specific meaning (set by the prompt note): "the user is
 * genuinely the one speaking, not media they're merely playing." Dropping it
 * too would let a podcast/video picked up by the mic be coached and billed as
 * the user's own speech. `hasSubstance` + `hasCoachableEnglish` always gate.
 * Two-sided captures require all four, unchanged.
 */
export function decideAccepted(flags: {
    isRelevant: boolean;
    isOrganic: boolean;
    hasSubstance: boolean;
    hasCoachableEnglish: boolean;
    isOneSided: boolean;
}): boolean {
    const { isRelevant, isOrganic, hasSubstance, hasCoachableEnglish } = flags;
    if (flags.isOneSided) {
        return isRelevant && hasSubstance && hasCoachableEnglish;
    }
    return isRelevant && isOrganic && hasSubstance && hasCoachableEnglish;
}

// Appended to the validator prompt for one-sided captures so the model judges
// substance/English on the user's solo speech instead of reflexively rejecting
// the monologue. `decideAccepted` is the hard guarantee; this keeps the model's
// flag judgments aligned: `isOrganic` is dropped (rehearsed/solo is fine), and
// `isRelevant` is REDEFINED to mean "the user is genuinely speaking, not media."
const ONE_SIDED_VALIDATION_NOTE = `\n\n## One-sided capture (read this)\nOnly the user's side of this session was captured — the other party, if any, was not recorded, and the user may simply be practicing solo. This is expected and valid. Judge \`hasSubstance\` and \`hasCoachableEnglish\` on the user's own speech ALONE. Do NOT reject this for lacking a second speaker or for being a rehearsed/solo monologue — set \`isOrganic: true\`. Keep \`isRelevant\` meaningful: set it \`true\` when the user is genuinely the one speaking, and \`false\` ONLY if the audio is actually media the user is merely playing (a podcast, video, audiobook, or TV) rather than the user's own speech.`;

// User-facing rejection copy for the one-sided path (the LLM's own
// rejectionReason is often a two-sided "not a real conversation" complaint that
// contradicts the one-sided stance, so we override it). Soft, no jargon.
const ONE_SIDED_NOT_USER_REJECTION =
    "This sounded like audio playing rather than you speaking, so there was nothing for Sayzo to coach.";
const ONE_SIDED_THIN_REJECTION =
    "There wasn't enough of your own speech in this one yet for Sayzo to coach — give it a longer take and try again.";

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
    isOneSided: boolean,
    refs?: { uid?: string | null; captureId?: string | null },
): Promise<ValidationResult> {
    const system = readPrompt();
    const modelName = defaultModel();
    const userPrompt =
        `## Title\n${title}\n\n## Summary\n${summary}\n\n## Transcript\n${formatTranscript(transcript)}` +
        (isOneSided ? ONE_SIDED_VALIDATION_NOTE : "");
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
                prompt: userPrompt,
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
    const accepted = decideAccepted({
        isRelevant,
        isOrganic,
        hasSubstance,
        hasCoachableEnglish,
        isOneSided,
    });

    // Layer-2: record which relevance gate(s) actually GATED — only the flags
    // that can cause this capture's rejection, so an accepted capture never
    // emits a phantom REJECTED_* outcome (which would inflate the
    // capture.validate rejection_rate alert + admin rollups). `isOrganic` is
    // not a gate for one-sided captures, so a false value there is not a
    // rejection signal and is skipped.
    const outcomes: LlmQualityOutcome[] = [];
    if (!isRelevant) outcomes.push("REJECTED_NOT_RELEVANT");
    if (!isOrganic && !isOneSided) outcomes.push("REJECTED_NOT_ORGANIC");
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

    // One-sided rejections: the LLM's rejectionReason is often a two-sided
    // "not a real conversation / rehearsed monologue" complaint that the
    // one-sided stance explicitly rejects. Override it with copy that matches
    // the actual gate that failed (relevance = media-not-user; else substance).
    if (isOneSided) {
        return {
            accepted: false,
            rejectionReason: !isRelevant
                ? ONE_SIDED_NOT_USER_REJECTION
                : ONE_SIDED_THIN_REJECTION,
        };
    }

    return {
        accepted: false,
        rejectionReason:
            rejectionReason ?? "Conversation did not meet relevance criteria",
    };
}
