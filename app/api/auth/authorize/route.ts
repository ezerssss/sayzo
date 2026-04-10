import { NextResponse, type NextRequest } from "next/server";

import { createAuthSession } from "@/lib/auth/firestore";

export const runtime = "nodejs";

const ALLOWED_REDIRECT_PREFIXES = [
    "http://127.0.0.1",
    "http://localhost",
] as const;

function isValidRedirectUri(uri: string): boolean {
    return ALLOWED_REDIRECT_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;

    const redirectUri = params.get("redirect_uri");
    const codeChallenge = params.get("code_challenge");
    const codeChallengeMethod = params.get("code_challenge_method");
    const state = params.get("state");

    if (!redirectUri || !codeChallenge || !codeChallengeMethod || !state) {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description:
                    "Missing required parameters: redirect_uri, code_challenge, code_challenge_method, state",
            },
            { status: 400 },
        );
    }

    if (codeChallengeMethod !== "S256") {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description:
                    "Only S256 code_challenge_method is supported",
            },
            { status: 400 },
        );
    }

    if (!isValidRedirectUri(redirectUri)) {
        return NextResponse.json(
            {
                error: "invalid_request",
                error_description:
                    "redirect_uri must start with http://127.0.0.1 or http://localhost",
            },
            { status: 400 },
        );
    }

    const sessionId = await createAuthSession({
        codeChallenge,
        codeChallengeMethod: "S256",
        redirectUri,
        state,
    });

    const loginUrl = new URL("/login", request.url);
    const response = NextResponse.redirect(loginUrl);

    response.cookies.set("oauth_session_id", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 300,
        secure: request.nextUrl.protocol === "https:",
    });

    return response;
}
