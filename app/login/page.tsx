import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getValidAuthSession } from "@/lib/auth/firestore";

import { LoginForm } from "./login-form";

export const runtime = "nodejs";

// `/login` is the desktop OAuth (PKCE) bridge, NOT a general web sign-in page.
// It only works mid-handshake: `/api/auth/authorize` sets the httpOnly
// `oauth_session_id` cookie before sending the user here, and `/api/auth/callback`
// hard-requires that cookie. Anyone arriving without a live session (stale tab,
// bookmark, expired handshake) would otherwise get a dead-end form, so we gate
// server-side here and send them to the app's real in-place sign-in instead.
export default async function LoginPage() {
    const sessionId = (await cookies()).get("oauth_session_id")?.value;
    const session = sessionId ? await getValidAuthSession(sessionId) : null;
    if (!session) {
        redirect("/app");
    }

    return <LoginForm />;
}
