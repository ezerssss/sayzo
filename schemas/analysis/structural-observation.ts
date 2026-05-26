import { z } from "zod";

/**
 * A cross-turn observation about how a conversation could have been sequenced
 * or framed — the "zoom out" coaching that doesn't fit inside a single turn's
 * note. Conversation-only (captures). `affectedTurnIdxs` render as clickable
 * chips; the server bounds-checks them.
 */
export const structuralObservationSchema = z.object({
    observation: z.string(),
    explanation: z.string(),
    affectedTurnIdxs: z.array(z.number()),
});
export type StructuralObservation = z.infer<typeof structuralObservationSchema>;
