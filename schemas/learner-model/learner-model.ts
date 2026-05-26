import { z } from "zod";

import { trackedPatternSchema } from "./tracked-pattern";

export const LEARNER_MODEL_VERSION = 1;

/**
 * Prose context the planner reads to ground drills in the user's real world.
 * Was three separate server-only fields on `users/{uid}`:
 *   drillNotes     ← internalLearnerContext       (drill-derived)
 *   realWorldNotes ← internalCaptureContext        (who/what/where they communicate)
 *   deliveryNotes  ← internalCaptureDeliveryNotes  (how they actually speak)
 */
export const learnerContextSchema = z.object({
    drillNotes: z.string(),
    realWorldNotes: z.string(),
    deliveryNotes: z.string(),
});
export type LearnerContext = z.infer<typeof learnerContextSchema>;

/**
 * The single per-user coaching model — one doc in `learner-models/{uid}`,
 * server-only (admin read, no client write). Every LLM step reads its slice
 * from here and writes back to it.
 *
 * Phase 1 merges the old `skill-memories` doc + the three `users/*`
 * internal-context prose fields (closing a leak: those fields used to sit on
 * the owner-readable `users` doc). Still to come:
 *   - Phase 2 adds `trackedPatterns` (the differential backbone) + consolidates cursors.
 *   - Phase 3 folds the `user-focus-insights` projection in here.
 */
export const learnerModelSchema = z.object({
    uid: z.string(),

    // The differential backbone: durable habits with server-owned trend/recency
    // that the history-aware analyzers read and the model-writers update.
    trackedPatterns: z.array(trackedPatternSchema),

    // Skills/habits (was the skill-memories doc).
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    /** Sustained-strong — deprioritize. */
    masteredFocus: z.array(z.string()),
    /** Regressed/unstable — revisit soon. */
    reinforcementFocus: z.array(z.string()),

    // Prose — the planner's "who they are / their world / how they speak".
    context: learnerContextSchema,

    // Idempotency cursors (kept separate in Phase 1; Phase 2 consolidates).
    /** Last session consumed by the skill-memory writer. */
    lastProcessedSessionId: z.string().nullable(),
    /** Last session merged into `context.drillNotes`. */
    lastLearnerContextSessionId: z.string(),
    /** Last capture merged into `context.realWorldNotes` / `deliveryNotes`. */
    lastCaptureContextCaptureId: z.string(),

    schemaVersion: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type LearnerModel = z.infer<typeof learnerModelSchema>;

/** Empty model for a brand-new user — seeded at onboarding completion. */
export function createEmptyLearnerModel(
    uid: string,
    now: string,
): LearnerModel {
    return {
        uid,
        trackedPatterns: [],
        strengths: [],
        weaknesses: [],
        masteredFocus: [],
        reinforcementFocus: [],
        context: { drillNotes: "", realWorldNotes: "", deliveryNotes: "" },
        lastProcessedSessionId: null,
        lastLearnerContextSessionId: "",
        lastCaptureContextCaptureId: "",
        schemaVersion: LEARNER_MODEL_VERSION,
        createdAt: now,
        updatedAt: now,
    };
}
