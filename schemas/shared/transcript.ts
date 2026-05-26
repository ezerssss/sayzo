import { z } from "zod";

/**
 * One transcript utterance, shared by drills and captures.
 *
 * Drills are monologues, so every line carries `speaker: "user"`. Captures are
 * multi-speaker: `"user"` is the learner; `"other_1"`, `"other_2"`,
 * `"other_unmic"`, etc. are everyone else (conversational context only).
 */
export const captureTranscriptLineSchema = z.object({
    speaker: z.string(),
    start: z.number(),
    end: z.number(),
    text: z.string(),
});
export type CaptureTranscriptLine = z.infer<typeof captureTranscriptLineSchema>;
