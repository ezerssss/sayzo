import { z } from "zod";

/**
 * A user's reaction to a piece of coaching output (a capture's or replay's
 * feedback). The only direct quality signal we collect from end users — surfaced
 * to admins to monitor how prompt output lands.
 *
 * Content-free except `reason`: every other field is an enum or an id reference.
 * `reason` is the user's own typed note (NOT transcript), so it MAY be stored —
 * it is the single user-authored free-text field in the metrics surface and the
 * only one an admin should treat as user PII.
 */

export const reactionSourceSchema = z.enum(["capture", "session"]);
export type ReactionSource = z.infer<typeof reactionSourceSchema>;

/**
 * Which slice of the feedback the reaction is about. Phase B ships only the
 * `overall` bar; the finer targets exist so per-section bars can be added later
 * without a schema migration.
 */
export const reactionTargetSchema = z.enum([
    "coaching_insight",
    "fix_these_first",
    "improved_version",
    "overall",
]);
export type ReactionTarget = z.infer<typeof reactionTargetSchema>;

export const reactionRatingSchema = z.enum(["up", "down"]);
export type ReactionRating = z.infer<typeof reactionRatingSchema>;

export const reactionReasonCodeSchema = z.enum([
    "inaccurate",
    "not_helpful",
    "too_harsh",
    "confusing",
    "helpful",
    "other",
]);
export type ReactionReasonCode = z.infer<typeof reactionReasonCodeSchema>;

export const itemReactionSchema = z.object({
    uid: z.string(),
    source: reactionSourceSchema,
    itemId: z.string(),
    target: reactionTargetSchema,
    rating: reactionRatingSchema,
    reasonCode: reactionReasonCodeSchema.nullable(),
    reason: z.string().max(280).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type ItemReaction = z.infer<typeof itemReactionSchema>;

/**
 * What the client POSTs to /api/reactions. The server owns `uid`, `createdAt`,
 * and `updatedAt`; everything else comes from the user. `reason` is trimmed and
 * length-capped here.
 */
export const reactionSubmissionSchema = z.object({
    source: reactionSourceSchema,
    itemId: z.string().min(1),
    target: reactionTargetSchema.default("overall"),
    rating: reactionRatingSchema,
    reasonCode: reactionReasonCodeSchema.nullable().default(null),
    reason: z.string().trim().max(280).nullable().default(null),
});
export type ReactionSubmission = z.infer<typeof reactionSubmissionSchema>;

/** One reaction per (item, target, user). Re-submitting updates in place. */
export function reactionDocId(
    source: ReactionSource,
    itemId: string,
    uid: string,
    target: ReactionTarget,
): string {
    return `${source}__${itemId}__${uid}__${target}`;
}
