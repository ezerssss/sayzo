import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { type UserProfileType } from "@/schemas";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Account-state gate for the desktop agent. The agent calls this on launch,
 * once per hour while running, and on a brief 8-second poll while the user is
 * on the "finish setup" screen. Bearer auth — same flow as /api/sessions/today.
 *
 * `account_state` is the discriminator the agent uses to decide whether to arm
 * recording. It is keyed off whether the user's baseline doc EXISTS, NOT off
 * onboarding: a provisioned user is `active` and records immediately, even with
 * `onboarding_complete: false`. The onboarding questionnaire is an optional
 * "personalize your coaching" step in the webapp and no longer gates the agent.
 * Baseline docs are provisioned at the token-grant step (/api/auth/token), so a
 * desktop-first user is already `active` by the time they reach here. We emit:
 *   - `active`: the user doc exists.
 *   - `onboarding_required`: no user doc yet. In practice a bounded state — an
 *     existing pre-rollout token that hasn't re-granted (provisioning runs on
 *     its next grant/refresh, ≤1h), or a deleted user's residual token.
 *   - `suspended`: no field for it yet; deferred until we add one.
 *   - `deleted`: indistinguishable from "no doc" here. Admin deletion is a hard
 *     cascade-delete (lib/admin/cascade-delete.ts) — the Firestore profile and
 *     refresh tokens are wiped, so a still-valid agent access token (HS256,
 *     signature-only) collapses to "no profile doc", reported as
 *     `onboarding_required`. The token loses access on refresh anyway (≤1h), so
 *     this is acceptable degradation. NOTE: we deliberately DO NOT provision on
 *     read here — that would let a deleted user's residual token resurrect their
 *     profile. Provisioning lives only at /api/auth/token.
 *
 * `suspended`/`deleted` will join the emitted set the moment they have a backing
 * field; the agent already handles them per spec.
 */

type AccountState = "active" | "onboarding_required" | "suspended" | "deleted";

function buildOnboardingUrl(): string {
    const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";
    const trimmed = baseUrl.replace(/\/+$/, "");
    return `${trimmed}/app/onboarding`;
}

export async function GET(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid, email } = auth;

    let onboardingComplete = false;
    let userExists = false;
    try {
        const db = getAdminFirestore();
        const snap = await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .get();
        if (snap.exists) {
            userExists = true;
            const data = snap.data() as Partial<UserProfileType>;
            onboardingComplete = data.onboardingComplete === true;
        }
    } catch (error) {
        console.error("[/api/me] profile lookup failed", error);
        return NextResponse.json(
            { error: "Failed to load account state." },
            { status: 500 },
        );
    }

    // Precedence: hard account states FIRST, then provisioning/onboarding.
    // `suspended`/`deleted` have no backing field yet (see header comment), but
    // they belong AHEAD of the exists→active shortcut so adding one later can't
    // silently fall through to "active":
    //   if (isSuspended(data)) accountState = "suspended";
    //   else if (isDeleted(data)) accountState = "deleted"; else ↓
    // A provisioned user (doc exists) is `active` regardless of onboarding.
    const accountState: AccountState = userExists
        ? "active"
        : "onboarding_required";

    return NextResponse.json(
        {
            user_id: uid,
            email,
            onboarding_complete: onboardingComplete,
            onboarding_url: buildOnboardingUrl(),
            account_state: accountState,
            issued_at: new Date().toISOString(),
        },
        {
            headers: {
                "Cache-Control": "private, no-store",
            },
        },
    );
}
