import { z } from "zod";

/**
 * A single, highest-impact coaching takeaway — distilled for the desktop agent's
 * post-capture notification card and surfaced (expanded) as the hero on the web
 * feedback page. Stored at `ItemAnalysis.coachingInsight`; projected to the
 * snake_case `coaching_insight` field on `GET /api/captures/{id}`.
 *
 * The server is the SOLE source and guardrail (the agent has no local
 * transcript). The char limits size the copy for a tiny card. `quote`, when
 * present, is VERIFIED server-side to be a verbatim substring of the user's own
 * (already echo-filtered) transcript channel before it reaches this shape — see
 * `verifyInsightQuote` in `lib/captures/analyze.ts`. `null` (no insight) is a
 * first-class, correct outcome — never padded with generic filler.
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
    headline: z.string().max(60),
    /**
     * Verbatim substring of the user's own transcript channel, or null when the
     * insight isn't about one specific utterance. Never paraphrased — the server
     * verifies it against the user lines and nulls it if it isn't a real quote.
     */
    quote: z.string().max(120).nullable(),
    /** The concrete suggestion / rewrite / observation for THIS capture. */
    body: z.string().max(140),
    /** Optional one-liner on why it helps. */
    why: z.string().max(80).nullable(),
});
export type CoachingInsight = z.infer<typeof coachingInsightSchema>;
