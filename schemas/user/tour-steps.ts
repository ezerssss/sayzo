/**
 * Stable IDs for the one-time page-guide spotlight steps. Persisted per-user
 * on `users/{uid}.seenTourSteps` — NEVER rename an ID (renaming re-shows the
 * step to every user). Add new features as NEW ids; retired ids may linger in
 * user docs forever and must be ignored by readers.
 *
 * The UI definitions (copy, page membership, order) live in
 * `components/tour/steps.ts`; only the durable identifiers belong here.
 */
export const TOUR_STEP_IDS = [
    "meeting-notes",
    "improved-version-tab",
    "discuss-feedback",
    "transcript-views",
    "transcript-fix",
    "replay-conversation",
    "fix-these-first",
    "retry-replay",
] as const;

export type TourStepId = (typeof TOUR_STEP_IDS)[number];

/** Allowlist for validating client-submitted ids (POST /api/tour/seen). */
export const TOUR_STEP_ID_SET: ReadonlySet<string> = new Set(TOUR_STEP_IDS);
