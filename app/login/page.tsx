"use client";

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";

import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { auth, googleProvider } from "@/lib/firebase/client";

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    async function handleSignIn() {
        setLoading(true);
        setError(null);

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
                throw new Error(data.error || "Authentication failed");
            }

            const { redirectUrl } = await res.json();
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
