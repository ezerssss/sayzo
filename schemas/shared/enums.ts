import { z } from "zod";

/**
 * Cross-cutting enums shared across coaching/analysis/learner-model schemas.
 * Defined once here so the analyzers, the learner model, and the focus
 * projection all speak the same vocabulary.
 */

/** Classification for a teachable coaching moment. */
export const teachableMomentTypeSchema = z.enum([
    "grammar",
    "filler",
    "phrasing",
    "vocabulary",
    "communication",
]);
export type TeachableMomentType = z.infer<typeof teachableMomentTypeSchema>;

/** Severity of a teachable moment: stylistic → clarity-impacting → meaning-impacting. */
export const teachableMomentSeveritySchema = z.enum([
    "minor",
    "moderate",
    "major",
]);
export type TeachableMomentSeverity = z.infer<
    typeof teachableMomentSeveritySchema
>;

/**
 * Verdict for one user turn in a captured conversation. Drives the per-turn
 * pill + layout in the UI.
 */
export const rewriteVerdictSchema = z.enum([
    "keep",
    "tighten",
    "sharpen",
    "reframe",
    "reorder",
    // Turn was predominantly non-English (or unreadably garbled — ASR runs
    // language=en, so other languages transcribe as pseudo-English). Pure
    // passthrough: rewrite === original, note === null, excluded from every
    // coaching/metrics surface, rendered dimmed in the UI.
    "non_english",
]);
export type RewriteVerdict = z.infer<typeof rewriteVerdictSchema>;

/**
 * Fixed backbone categories for tracked habits and focus themes. Stable across
 * users so progress on one category can be tracked over time even as the
 * surface wording changes.
 */
export const focusThemeCategorySchema = z.enum([
    "clarity",
    "directness",
    "structure",
    "delivery",
    "precision",
    "engagement",
]);
export type FocusThemeCategory = z.infer<typeof focusThemeCategorySchema>;

export const focusThemeTrendSchema = z.enum([
    "new",
    "improving",
    "stable",
    "regressing",
]);
export type FocusThemeTrend = z.infer<typeof focusThemeTrendSchema>;

export const focusThemeConfidenceSchema = z.enum(["low", "medium", "high"]);
export type FocusThemeConfidence = z.infer<typeof focusThemeConfidenceSchema>;
