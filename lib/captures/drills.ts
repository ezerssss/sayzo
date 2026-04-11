import "server-only";

/**
 * Drill generation from captures — design TBD.
 *
 * The capture's `analysis` field stores all raw material needed for future
 * drill generation. Two types are envisioned:
 *
 * - **Targeted drills**: standard platform drills seeded with the user's
 *   actual mistakes and context from captures.
 * - **Scenario replay drills**: recreate the real conversation scenario
 *   so the user can practice improving their delivery.
 *
 * How these feed into the `sessions` collection (automatic generation,
 * user-triggered, or suggested-and-accepted) is an open design question.
 */
export async function generateDrillsFromCapture(): Promise<void> {
    // No-op — drill generation mechanism is pending design.
}
