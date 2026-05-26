import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { signAccessToken } from "@/lib/auth/jwt";
import { verifyPkce } from "@/lib/auth/pkce";
import {
    consumeAuthCode,
    createRefreshToken,
    getRefreshToken,
    deleteRefreshToken,
} from "@/lib/auth/firestore";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { ensureUserProvisioned } from "@/lib/user/provision";

export const runtime = "nodejs";

function oauthError(
    error: string,
    description: string,
    status: number,
): NextResponse {
    return NextResponse.json(
        { error, error_description: description },
        { status },
    );
}

/**
 * Whether the Firebase Auth user still exists and isn't disabled. This is the
 * gate that stops `ensureUserProvisioned` from resurrecting an admin-deleted
 * account: admin cascade-delete disables the auth user (first, before any
 * Firestore cleanup) and finally deletes it, so even a residual auth code or
 * refresh token that survived the best-effort cleanup is rejected here before
 * we provision or mint. A transient `getUser` failure rethrows → the grant
 * 500s (retryable) rather than silently provisioning.
 */
async function isFirebaseUserActive(uid: string): Promise<boolean> {
    try {
        const user = await getAuth(getFirebaseAdminApp()).getUser(uid);
        return user.disabled !== true;
    } catch (error) {
        if ((error as { code?: string }).code === "auth/user-not-found") {
            return false;
        }
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Authorization code → tokens
// ---------------------------------------------------------------------------

async function handleCodeExchange(params: URLSearchParams) {
    const code = params.get("code");
    const codeVerifier = params.get("code_verifier");
    const redirectUri = params.get("redirect_uri");

    if (!code || !codeVerifier || !redirectUri) {
        return oauthError(
            "invalid_request",
            "Missing code, code_verifier, or redirect_uri",
            400,
        );
    }

    // Atomically claim the single-use code so two concurrent exchanges can't
    // both succeed (and both mint a refresh token).
    const authCode = await consumeAuthCode(code);
    if (!authCode) {
        return oauthError(
            "invalid_grant",
            "Authorization code not found or already used",
            400,
        );
    }

    if (Date.now() > authCode.expiresAt) {
        return oauthError("invalid_grant", "Authorization code expired", 400);
    }

    // PKCE verification: SHA256(code_verifier) must match stored code_challenge
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
        return oauthError("invalid_grant", "PKCE verification failed", 400);
    }

    // Verify redirect_uri matches
    if (redirectUri !== authCode.redirectUri) {
        return oauthError("invalid_grant", "redirect_uri does not match", 400);
    }

    // Refuse to (re)provision or mint for a deleted/disabled account, so a code
    // that outlived an admin cascade-delete can't resurrect the user.
    if (!(await isFirebaseUserActive(authCode.firebaseUid))) {
        return oauthError("invalid_grant", "Account is no longer active", 401);
    }

    // Provision baseline docs for a desktop-first user. Idempotent — a no-op
    // when the user already exists.
    await ensureUserProvisioned(authCode.firebaseUid);

    // Mint tokens
    const accessToken = await signAccessToken({
        sub: authCode.firebaseUid,
        email: authCode.email,
    });
    const refreshToken = await createRefreshToken(
        authCode.firebaseUid,
        authCode.email,
    );

    return NextResponse.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
        token_type: "Bearer",
    });
}

// ---------------------------------------------------------------------------
// Refresh token → new access token
// ---------------------------------------------------------------------------

async function handleRefresh(params: URLSearchParams) {
    const rawToken = params.get("refresh_token");
    if (!rawToken) {
        return oauthError("invalid_request", "Missing refresh_token", 400);
    }

    const tokenData = await getRefreshToken(rawToken);
    if (!tokenData) {
        return oauthError("invalid_grant", "Refresh token not found", 401);
    }

    if (Date.now() > tokenData.expiresAt) {
        await deleteRefreshToken(rawToken);
        return oauthError("invalid_grant", "Refresh token expired", 401);
    }

    // Refuse to (re)provision/mint for a deleted or disabled account, and drop
    // the now-orphaned refresh token. This is what keeps a refresh token that
    // survived cascade-delete's best-effort cleanup from resurrecting the user
    // via ensureUserProvisioned below.
    if (!(await isFirebaseUserActive(tokenData.firebaseUid))) {
        await deleteRefreshToken(rawToken);
        return oauthError("invalid_grant", "Account is no longer active", 401);
    }

    // Idempotent provisioning also self-heals an existing desktop-first user who
    // was blocked pre-rollout: their doc is created on the next refresh.
    await ensureUserProvisioned(tokenData.firebaseUid);

    // Mint new tokens first, then delete the old refresh token (safe order).
    const accessToken = await signAccessToken({
        sub: tokenData.firebaseUid,
        email: tokenData.email,
    });
    const newRefreshToken = await createRefreshToken(
        tokenData.firebaseUid,
        tokenData.email,
    );

    // Rotate: delete old refresh token after new one is persisted
    await deleteRefreshToken(rawToken);

    return NextResponse.json({
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: 3600,
        token_type: "Bearer",
    });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
        return handleCodeExchange(params);
    }
    if (grantType === "refresh_token") {
        return handleRefresh(params);
    }

    return oauthError(
        "unsupported_grant_type",
        "grant_type must be authorization_code or refresh_token",
        400,
    );
}
