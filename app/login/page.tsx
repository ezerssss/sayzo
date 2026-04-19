"use client";

import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { signInWithPopup } from "firebase/auth";

import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { track } from "@/lib/analytics/client";
import { auth, googleProvider } from "@/lib/firebase/client";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    async function handleSignIn() {
        setLoading(true);
        setError(null);
        track("sign_in_clicked", { source: "login_page" });

        try {
            const result = await signInWithPopup(auth, googleProvider);
            const idToken = await result.user.getIdToken();

            const res = await fetch("/api/auth/callback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });

            if (!res.ok) {
                const data = await res.json();
                track("sign_in_failed", {
                    code: typeof data.error === "string" ? data.error : "callback_error",
                    stage: "callback",
                });
                throw new Error(data.error || "Authentication failed");
            }

            const { redirectUrl } = await res.json();
            const meta = result.user.metadata;
            const newUser =
                Boolean(meta.creationTime) &&
                meta.creationTime === meta.lastSignInTime;
            track("sign_in_success", { new_user: newUser });
            setDone(true);
            window.location.href = redirectUrl;
        } catch (err) {
            setLoading(false);
            if (
                err instanceof Error &&
                err.message.includes("popup-closed-by-user")
            ) {
                return;
            }
            if (err instanceof FirebaseError) {
                track("sign_in_failed", { code: err.code, stage: "popup" });
            }
            setError(
                err instanceof Error ? err.message : "Something went wrong",
            );
        }
    }

    const buttonLabel = done
        ? "Redirecting..."
        : loading
          ? "Signing in..."
          : "Continue with Google";

    return (
        <main className="flex min-h-screen w-full items-center justify-center p-6">
            <GoogleLoginPanel
                loading={loading}
                authError={error}
                onSignInWithGoogle={handleSignIn}
                buttonLabel={buttonLabel}
                disabled={loading || done}
            />
        </main>
    );
}
