import { z } from "zod";

import {
    focusThemeCategorySchema,
    focusThemeConfidenceSchema,
    focusThemeTrendSchema,
} from "@/schemas/shared/enums";

/**
 * One durable behavioral habit the analyzer reads (to be differential) and the
 * model-writers update over time. `trend` + `lastSeenAt` + `occurrences` are
 * what let per-item feedback say "note progress on this, then move on" instead
 * of re-diagnosing the same gap from scratch.
 *
 * The persisted shape (below) carries server-owned state. The LLM only ever
 * proposes the descriptive subset (`llmTrackedPatternSchema`) — the server
 * computes trend/lastSeen/occurrences/confidence by diffing against the stored
 * set, so the model can't hallucinate progress (same principle as the
 * anchor-resolver owning transcriptIdx).
 */
export const trackedPatternSchema = z.object({
    /** Stable slug for cross-time diffing, e.g. "buries_recommendation". */
    id: z.string(),
    /** Plain behavioral phrasing, second person. "You explain background before your point." */
    label: z.string(),
    category: focusThemeCategorySchema,
    kind: z.enum(["strength", "weakness"]),
    trend: focusThemeTrendSchema,
    /** ISO of the most recent item that exhibited this (server-set). */
    lastSeenAt: z.string(),
    /** id of the most recent source item (drill or capture) exhibiting it (server-set). */
    lastSeenSourceId: z.string(),
    /** How many analyzed items have touched this — for frequency framing (server-set). */
    occurrences: z.number(),
    confidence: focusThemeConfidenceSchema,
});
export type TrackedPattern = z.infer<typeof trackedPatternSchema>;

/**
 * LLM-facing patch: the analyzer/updater proposes only the descriptive fields.
 * The server merges these into the stored patterns and owns trend/lastSeenAt/
 * lastSeenSourceId/occurrences/confidence. See `lib/learner-model/tracked-patterns.ts`.
 */
export const llmTrackedPatternSchema = z.object({
    id: z.string(),
    label: z.string(),
    category: focusThemeCategorySchema,
    kind: z.enum(["strength", "weakness"]),
});
export type LlmTrackedPattern = z.infer<typeof llmTrackedPatternSchema>;
