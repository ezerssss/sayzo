import { z } from "zod";

/**
 * A single, highest-impact coaching takeaway — distilled for the desktop agent's
 * post-capture notification card and surfaced (expanded) as the hero on the web
 * feedback page. Stored at `ItemAnalysis.coachingInsight`; projected to the
 * snake_case `coaching_insight` field on `GET /api/captures/{id}`.
 *
 * The server is the SOLE source and guardrail (the agent has no local
 * transcript). Field lengths are uncapped — the desktop card and the web hero
 * both wrap text, so a complete thought is never truncated mid-sentence.
 * `quote`, when present, is always the user's REAL words: the server grounds it
 * on the user's own (already echo-filtered) transcript channel and EXPANDS it
 * to a complete thought — or, for a near-verbatim model miss, recovers the real
 * user line — before it reaches this shape (see `resolveInsightQuote` in
 * `lib/captures/analyze.ts`). When the quote can't be grounded the server drops
 * it (the card still ships, without a "You said:" line), never a paraphrase.
 * `null` (no insight) is a first-class, correct outcome — never padded with
 * generic filler.
 */
export const coachingInsightTypeSchema = z.enum([
    "rephrase", // a better way to phrase a specific line the user said
    "structure", // how a turn / answer was ordered
    "clarity", // a specific unclear moment
    "pacing", // a concrete pacing / filler moment
    "strength", // something real they did well (positive reinforcement)
    "other",
]);
export type CoachingInsightType = z.infer<typeof coachingInsightTypeSchema>;

export const coachingInsightSchema = z.object({
    type: coachingInsightTypeSchema,
    /** Plain, self-explanatory headline for the card — not clever. */
    headline: z.string(),
    /**
     * Verbatim words from the user's own transcript channel — grounded and
     * expanded to a complete thought server-side (see `resolveInsightQuote`),
     * never paraphrased. `null` when the insight isn't about one specific
     * utterance, or when the model's quote couldn't be grounded (the card still
     * ships without it).
     */
    quote: z.string().nullable(),
    /** The concrete suggestion / rewrite / observation for THIS capture. */
    body: z.string(),
    /** Optional one-liner on why it helps. */
    why: z.string().nullable(),
});
export type CoachingInsight = z.infer<typeof coachingInsightSchema>;
