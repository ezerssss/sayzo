import { z } from "zod";

/** Max consecutive words a single correction may replace. */
export const MAX_CORRECTION_SPAN_WORDS = 4;
/** Max length of the replacement text. */
export const MAX_CORRECTION_REPLACEMENT_CHARS = 60;
/** Lifetime cap of corrections per capture. */
export const MAX_CORRECTIONS_PER_CAPTURE = 10;
/** Cap on the per-user ASR vocabulary fed to Deepgram as keyterms. */
export const MAX_ASR_VOCABULARY_TERMS = 50;

/**
 * One user-submitted mishearing fix, anchored to the immutable
 * `serverTranscript` by char offsets. The stored transcript is NEVER
 * mutated — corrections are an overlay applied at display/read time
 * (see `lib/captures/corrections.ts`). Deletions are impossible by
 * construction (`replacement` is non-empty), and every correction passes
 * deterministic guards + an LLM mishearing judge before it is stored.
 */
export const transcriptCorrectionSchema = z.object({
    /** Index into `serverTranscript`. */
    transcriptIdx: z.number().int().min(0),
    /** Char offsets into the stored line's `text` (stable: transcript is immutable). */
    charStart: z.number().int().min(0),
    charEnd: z.number().int().min(1),
    /**
     * Exact `text.slice(charStart, charEnd)` at submit time. Integrity check
     * at apply time — a mismatch means skip the correction, never guess.
     */
    original: z.string().min(1),
    /** Non-empty by construction — deletions are impossible. */
    replacement: z.string().min(1).max(MAX_CORRECTION_REPLACEMENT_CHARS),
    /** Judge verdict: a name/term worth remembering for future transcription. */
    isVocabularyTerm: z.boolean(),
    /** ISO 8601. */
    createdAt: z.string(),
});
export type TranscriptCorrection = z.infer<typeof transcriptCorrectionSchema>;
