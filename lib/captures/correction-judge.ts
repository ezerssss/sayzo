import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { runInstrumentedLLM } from "@/lib/llm/instrument";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

const judgeOutputSchema = z.object({
    items: z.array(
        z.object({
            index: z.number(),
            isMishearingFix: z.boolean(),
            isSanitizing: z.boolean(),
            isVocabularyTerm: z.boolean(),
            reason: z.string().nullable(),
        }),
    ),
});

export type CorrectionJudgeInput = {
    index: number;
    /** Full text of the transcript turn the fix belongs to (context). */
    turnText: string;
    original: string;
    replacement: string;
};

export type JudgedCorrection =
    | { index: number; accepted: true; isVocabularyTerm: boolean }
    | { index: number; accepted: false; reason: string };

// Standardized user-facing rejection copy — the judge's raw `reason` is for
// logs; users get these (mirrors how validate.ts overrides rejectionReason).
const SANITIZING_REJECTION =
    "That change cleans up how you spoke rather than fixing a mishearing, so the original stays. Sayzo coaches from what was really said — ums, hedges and all.";
const NOT_PHONETIC_REJECTION =
    "That doesn't sound close enough to what Sayzo heard to be a mishearing, so the original stays.";
const UNVERIFIED_REJECTION =
    "Sayzo couldn't check this fix just now. Please try again.";

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "correction-judge.md"), "utf-8");
}

/**
 * Tiny deterministic classification — mini handles it fine. Env override so
 * the judge can be bumped independently if mini proves too strict on
 * accented-name phonetics.
 */
function defaultModel(): string {
    return process.env.CORRECTION_JUDGE_MODEL?.trim() || "gpt-4o-mini";
}

function formatItems(items: CorrectionJudgeInput[]): string {
    return items
        .map(
            (item) =>
                `### Fix ${item.index}\nTurn: "${item.turnText}"\nOriginal: "${item.original}"\nReplacement: "${item.replacement}"`,
        )
        .join("\n\n");
}

/**
 * Judge a batch of guard-approved correction candidates in ONE model call.
 * Fail closed: items the judge omits or mis-indexes are rejected with a
 * retryable message; a thrown LLM error propagates so the route can return a
 * retryable error for the whole batch. Never auto-accept on judge failure.
 */
export async function judgeCorrections(
    items: CorrectionJudgeInput[],
    refs?: { uid?: string | null; captureId?: string | null },
): Promise<JudgedCorrection[]> {
    if (items.length === 0) return [];

    const system = readPrompt();
    const modelName = defaultModel();
    const { result } = await runInstrumentedLLM({
        promptKey: "capture.correction_judge",
        model: modelName,
        promptParts: { system },
        refs: { uid: refs?.uid ?? null, captureId: refs?.captureId ?? null },
        call: () =>
            generateText({
                model: openai(modelName),
                output: Output.object({
                    schema: zodSchema(judgeOutputSchema),
                    name: "TranscriptCorrectionJudgement",
                    description:
                        "Judges whether each transcript fix is a plausible mishearing correction.",
                }),
                system,
                prompt: `## Submitted fixes\n\n${formatItems(items)}`,
                temperature: 0,
            }),
    });

    const byIndex = new Map(result.output.items.map((i) => [i.index, i]));

    return items.map((item): JudgedCorrection => {
        const verdict = byIndex.get(item.index);
        if (!verdict) {
            return {
                index: item.index,
                accepted: false,
                reason: UNVERIFIED_REJECTION,
            };
        }
        if (verdict.isMishearingFix && !verdict.isSanitizing) {
            return {
                index: item.index,
                accepted: true,
                isVocabularyTerm: verdict.isVocabularyTerm,
            };
        }
        if (verdict.isSanitizing) {
            console.info(
                `[correction-judge] Rejected as sanitizing: "${item.original}" -> "${item.replacement}" (${verdict.reason ?? "no reason"})`,
            );
            return {
                index: item.index,
                accepted: false,
                reason: SANITIZING_REJECTION,
            };
        }
        console.info(
            `[correction-judge] Rejected as not-a-mishearing: "${item.original}" -> "${item.replacement}" (${verdict.reason ?? "no reason"})`,
        );
        return {
            index: item.index,
            accepted: false,
            reason: NOT_PHONETIC_REJECTION,
        };
    });
}
