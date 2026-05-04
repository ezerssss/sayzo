import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { type UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Account-state gate for the desktop agent. The agent calls this on launch,
 * once per hour while running, and on a brief 8-second poll while the user is
 * on the "finish setup" screen. Bearer auth — same flow as /api/sessions/today.
 *
 * `account_state` is the discriminator the agent uses to decide whether to arm
 * recording. We currently only emit `active` / `onboarding_required`:
 *   - `suspended`: no field for it yet; deferred until we add one.
 *   - `deleted`: indistinguishable from a never-onboarded user here. Admin
 *     deletion is a hard cascade-delete (lib/admin/cascade-delete.ts) — the
 *     Firestore profile and refresh tokens are wiped, so a still-valid agent
 *     access token (HS256, signature-only) collapses to "no profile doc",
 *     which we report as `onboarding_required`. The token loses access on
 *     refresh anyway (≤1h), so this is acceptable degradation.
 *
 * Both states will join the union the moment they have a backing field; the
 * agent already handles them per spec.
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
    try {
        const db = getAdminFirestore();
        const snap = await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .get();
        if (snap.exists) {
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

    const accountState: AccountState = onboardingComplete
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
