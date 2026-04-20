"use client";

import ky from "ky";

import { auth } from "@/lib/firebase/client";

/**
 * Shared ky instance for calling our own `/api/*` routes from the webapp.
 *
 * Attaches the current Firebase user's ID token as `Authorization: Bearer`
 * on every request. Server routes verify it via `requireAuth()`.
 *
 * For requests made before Firebase Auth has loaded (or while signed out),
 * the request is sent without a token — the server will return 401, which
 * callers can surface as a normal "please sign in" error.
 */
export const api = ky.create({
    hooks: {
        beforeRequest: [
            async (request) => {
                const user = auth.currentUser;
                if (!user) return;
                const token = await user.getIdToken();
                request.headers.set("Authorization", `Bearer ${token}`);
            },
        ],
    },
});
