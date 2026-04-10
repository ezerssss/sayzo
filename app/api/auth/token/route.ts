import { NextResponse, type NextRequest } from "next/server";

import { signAccessToken } from "@/lib/auth/jwt";
import { verifyPkce } from "@/lib/auth/pkce";
import {
    getAuthCode,
    deleteAuthCode,
    createRefreshToken,
    getRefreshToken,
    deleteRefreshToken,
} from "@/lib/auth/firestore";

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

    const authCode = await getAuthCode(code);
    if (!authCode) {
        return oauthError(
            "invalid_grant",
            "Authorization code not found or already used",
            400,
        );
    }

    if (Date.now() > authCode.expiresAt) {
        await deleteAuthCode(code);
        return oauthError(
            "invalid_grant",
            "Authorization code expired",
            400,
        );
    }

    // PKCE verification: SHA256(code_verifier) must match stored code_challenge
    if (!verifyPkce(codeVerifier, authCode.codeChallenge)) {
        return oauthError(
            "invalid_grant",
            "PKCE verification failed",
            400,
        );
    }

    // Verify redirect_uri matches
    if (redirectUri !== authCode.redirectUri) {
        return oauthError(
            "invalid_grant",
            "redirect_uri does not match",
            400,
        );
    }

    // Delete the auth code (single-use)
    await deleteAuthCode(code);

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
