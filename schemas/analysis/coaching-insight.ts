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
 * `quote`, when present, is VERIFIED server-side to be a verbatim substring of
 * the user's own (already echo-filtered) transcript channel before it reaches
 * this shape — see `verifyInsightQuote` in `lib/captures/analyze.ts`. `null`
 * (no insight) is a first-class, correct outcome — never padded with generic
 * filler.
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
     * Verbatim substring of the user's own transcript channel, or null when the
     * insight isn't about one specific utterance. Never paraphrased — the server
     * verifies it against the user lines and nulls it if it isn't a real quote.
     */
    quote: z.string().nullable(),
    /** The concrete suggestion / rewrite / observation for THIS capture. */
    body: z.string(),
    /** Optional one-liner on why it helps. */
    why: z.string().nullable(),
});
export type CoachingInsight = z.infer<typeof coachingInsightSchema>;
