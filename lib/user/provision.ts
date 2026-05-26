import "server-only";

import { FirestoreCollections, createBaselineUserProfile } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { updateLearnerModel } from "@/lib/learner-model/store";

/**
 * Idempotently provision a user's baseline Firestore documents — the same
 * `users/{uid}` + `learner-models/{uid}` pair that web onboarding
 * (`app/api/onboarding/complete`) creates. A no-op (single read) when the user
 * doc already exists, so it's cheap to call on every grant/refresh.
 *
 * Why this exists: a desktop-first user (installs the app and signs in before
 * ever touching the webapp) never runs onboarding, so those baseline docs were
 * never created — leaving `/api/me` reporting `onboarding_required` (agent
 * blocks) and the first capture upload's credit-consume `tx.update` throwing
 * NOT_FOUND. Provisioning here puts them in a valid state to record immediately.
 *
 * Why token-grant and NOT `/api/me` (a read): provisioning on read would let a
 * deleted user's still-valid ≤1h access token resurrect their profile. The
 * token-grant callers additionally gate on Firebase Auth being active (see
 * `app/api/auth/token`), so an admin-deleted/disabled user never reaches here.
 */
export async function ensureUserProvisioned(uid: string): Promise<void> {
    if (!uid) return;

    const db = getAdminFirestore();
    const userRef = db.collection(FirestoreCollections.users.path).doc(uid);

    // Fast path: already provisioned. Avoids any write (and `updatedAt` churn on
    // the learner model) on the common case — every refresh after the first.
    const userSnap = await userRef.get();
    if (userSnap.exists) return;

    // Create the learner model FIRST so the invariant "users/{uid} exists ⇒
    // learner-models/{uid} exists" holds: the user doc is the gate the fast path
    // checks, so a crash between the two writes (user doc created, learner model
    // not) can never strand a provisioned user without a model. `updateLearnerModel`
    // is an idempotent get-or-create with full scaffolding.
    await updateLearnerModel(db, uid, {});

    // Atomic create — fails with ALREADY_EXISTS if a concurrent grant/onboarding
    // beat us here, so we never clobber a richer doc with the empty baseline.
    const now = new Date().toISOString();
    try {
        await userRef.create(createBaselineUserProfile(uid, now));
    } catch (error) {
        // Lost the create race (or a transient error). Re-read: if the doc now
        // exists someone else provisioned it — done. Otherwise surface the
        // failure so the grant 500s and the agent retries (nothing consumed).
        const recheck = await userRef.get();
        if (!recheck.exists) throw error;
    }
}
