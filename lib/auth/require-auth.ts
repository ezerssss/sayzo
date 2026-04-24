import "server-only";

import { getAuth } from "firebase-admin/auth";
import { NextResponse, type NextRequest } from "next/server";

import { verifyAccessToken } from "@/lib/auth/jwt";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";

export interface AuthedUser {
    uid: string;
    email: string;
}

function unauthorized(message: string): NextResponse {
    return NextResponse.json(
        { error: "unauthorized", message },
        { status: 401 },
    );
}

/**
 * Verify the caller from the `Authorization: Bearer <token>` header.
 *
 * Accepts two token formats:
 *   1. HS256 JWT issued by `/api/auth/token` (desktop agent).
 *   2. Firebase ID token from the Firebase Auth client SDK (webapp).
 *
 * Returns the authenticated user on success, or a `NextResponse` that the
 * caller should return directly. Route handlers should use:
 *
 *     const auth = await requireAuth(request);
 *     if (auth instanceof NextResponse) return auth;
 *     const { uid, email } = auth;
 */
export async function requireAuth(
    request: NextRequest,
): Promise<AuthedUser | NextResponse> {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) {
        return unauthorized("Missing Bearer token");
    }
    const token = header.slice(7).trim();
    if (!token) {
        return unauthorized("Missing Bearer token");
    }

    try {
        const payload = await verifyAccessToken(token);
        if (payload.sub) {
            return { uid: payload.sub, email: payload.email ?? "" };
        }
    } catch {
        // Not a valid internal JWT — try Firebase ID token next.
    }

    try {
        const adminAuth = getAuth(getFirebaseAdminApp());
        const decoded = await adminAuth.verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email ?? "" };
    } catch {
        return unauthorized("Invalid or expired token");
    }
}

/**
 * Like `requireAuth`, but returns `null` instead of a 401 response when the
 * caller is anonymous or the token is invalid. Use this for routes that accept
 * both signed-in and anonymous requests (e.g. public support form).
 */
export async function tryAuth(
    request: NextRequest,
): Promise<AuthedUser | null> {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7).trim();
    if (!token) return null;

    try {
        const payload = await verifyAccessToken(token);
        if (payload.sub) {
            return { uid: payload.sub, email: payload.email ?? "" };
        }
    } catch {
        // fall through to Firebase ID token verification
    }

    try {
        const adminAuth = getAuth(getFirebaseAdminApp());
        const decoded = await adminAuth.verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email ?? "" };
    } catch {
        return null;
    }
}
