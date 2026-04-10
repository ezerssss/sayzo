"use client";

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { LogIn, Loader2 } from "lucide-react";

import { auth, googleProvider } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

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

    return (
        <main className="flex min-h-screen items-center justify-center p-4">
            <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <div className="space-y-3">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        eloquy
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Sign in with your Google account to connect the Eloquy
                        desktop agent.
                    </p>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                    <Button
                        disabled={loading || done}
                        onClick={handleSignIn}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <LogIn />}
                        {done
                            ? "Redirecting..."
                            : loading
                              ? "Signing in..."
                              : "Continue with Google"}
                    </Button>

                    {error ? (
                        <p className="text-xs text-destructive" role="alert">
                            {error}
                        </p>
                    ) : null}
                </div>
            </section>
        </main>
    );
}
