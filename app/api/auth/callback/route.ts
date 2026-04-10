import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import {
    getAuthSession,
    deleteAuthSession,
    createAuthCode,
} from "@/lib/auth/firestore";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    let body: { idToken?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const idToken = body.idToken?.trim();
    if (!idToken) {
        return NextResponse.json(
            { error: "Missing idToken" },
            { status: 400 },
        );
    }

    const sessionId = request.cookies.get("oauth_session_id")?.value;
    if (!sessionId) {
        return NextResponse.json(
            { error: "No OAuth session found. Please restart the login flow." },
            { status: 400 },
        );
    }

    const session = await getAuthSession(sessionId);
    if (!session) {
        return NextResponse.json(
            { error: "OAuth session expired or invalid. Please try again." },
            { status: 400 },
        );
    }

    if (Date.now() > session.expiresAt) {
        await deleteAuthSession(sessionId);
        return NextResponse.json(
            { error: "OAuth session expired. Please restart the login flow." },
            { status: 400 },
        );
    }

    let decoded: { uid: string; email?: string };
    try {
        const adminAuth = getAuth(getFirebaseAdminApp());
        decoded = await adminAuth.verifyIdToken(idToken);
    } catch {
        return NextResponse.json(
            { error: "Invalid Firebase ID token" },
            { status: 401 },
        );
    }

    const code = await createAuthCode({
        sessionId,
        firebaseUid: decoded.uid,
        email: decoded.email ?? "",
        redirectUri: session.redirectUri,
        codeChallenge: session.codeChallenge,
    });

    // Clean up the session — the auth code is now the source of truth.
    await deleteAuthSession(sessionId);

    const redirectUrl = `${session.redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(session.state)}`;

    const response = NextResponse.json({ redirectUrl });
    response.cookies.delete("oauth_session_id");
    return response;
}
