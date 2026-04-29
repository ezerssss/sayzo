import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth, type AuthedUser } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";

/**
 * Verify the caller is signed in AND has `isAdmin: true` on their user profile.
 *
 * Returns 404 (not 401/403) for non-admins so the existence of `/api/admin/**`
 * routes isn't leaked to the rest of the world. A truly anonymous caller still
 * gets a 401 from `requireAuth`, which is fine — the 404 is specifically for
 * "you presented a valid token but you're not an admin."
 *
 * Always re-reads the user doc on every call. We do NOT trust a possibly-stale
 * Firebase custom claim or any client-supplied flag.
 *
 * Usage mirrors `requireAuth`:
 *
 *     const auth = await requireAdmin(request);
 *     if (auth instanceof NextResponse) return auth;
 *     const { uid, email } = auth;
 */
export async function requireAdmin(
    request: NextRequest,
): Promise<AuthedUser | NextResponse> {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) {
        // Token missing/invalid — surface as 404 too, so the route looks
        // identical to non-existent paths regardless of auth state.
        return notFound();
    }

    // Admin must come from the webapp Firebase session, not the desktop agent.
    // Agent refresh tokens live 90 days; if one leaks we don't want it to
    // unlock admin operations. The dashboard signs in via Firebase directly,
    // so this never blocks legitimate admin use.
    if (auth.source !== "firebase") {
        return notFound();
    }

    try {
        const db = getAdminFirestore();
        const snap = await db
            .collection(FirestoreCollections.users.path)
            .doc(auth.uid)
            .get();
        if (!snap.exists) {
            return notFound();
        }
        const profile = snap.data() as Partial<UserProfileType>;
        if (profile.isAdmin !== true) {
            return notFound();
        }
        return auth;
    } catch (error) {
        console.error("[requireAdmin] profile lookup failed", error);
        return notFound();
    }
}

function notFound(): NextResponse {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
}
