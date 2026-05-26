import { z } from "zod";

import {
    teachableMomentSeveritySchema,
    teachableMomentTypeSchema,
} from "./enums";

/**
 * The three-part teachable shape used for EVERY coaching moment — `fixTheseFirst`,
 * `moreMoments`, and each dimensional `findings` entry. Each part does distinct
 * work, so all three are required:
 * - `anchor` grounds the feedback in evidence (without it, feedback is generic),
 * - `betterOption` gives a concrete target to copy,
 * - `whyThisMatters` carries the cost of what they did AND a reusable principle,
 *   woven into one narrative the UI shows under a single "Why this matters" toggle.
 */
export const coachingMomentSchema = z.object({
    anchor: z.string(),
    betterOption: z.string(),
    whyThisMatters: z.string(),
});
export type CoachingMoment = z.infer<typeof coachingMomentSchema>;

/**
 * LLM-facing teachable moment: a `CoachingMoment` plus classification metadata.
 * `transcriptIdx`/`timestamp` are deliberately absent — the server resolves them
 * from the verbatim `anchor` text via `lib/transcripts/anchor-resolver` so a
 * hallucinated line number can't pin coaching to the wrong utterance.
 */
export const llmTeachableMomentSchema = coachingMomentSchema.extend({
    type: teachableMomentTypeSchema,
    severity: teachableMomentSeveritySchema,
});
export type LlmTeachableMoment = z.infer<typeof llmTeachableMomentSchema>;

/** Persisted teachable moment: the LLM shape + the server-resolved position. */
export const teachableMomentSchema = llmTeachableMomentSchema.extend({
    timestamp: z.number(),
    transcriptIdx: z.number(),
});
export type TeachableMoment = z.infer<typeof teachableMomentSchema>;
