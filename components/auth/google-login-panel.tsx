"use client";

import Image from "next/image";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PropsInterface {
    loading: boolean;
    authError: string | null;
    onSignInWithGoogle: () => void;
}

export function GoogleLoginPanel(props: Readonly<PropsInterface>) {
    const { loading, authError, onSignInWithGoogle } = props;

    return (
        <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <Image
                        src="/sayzo-logo.png"
                        alt="Sayzo logo"
                        width={40}
                        height={40}
                        priority
                        className="rounded-lg"
                    />
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Sayzo
                    </h1>
                </div>
                <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                    <p>
                        Your English coach — tuned to how you actually speak.
                    </p>
                    <p>
                        Sign in to start practicing. Short drills, real
                        feedback, built for the situations in your week.
                    </p>
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
                <Button disabled={loading} onClick={onSignInWithGoogle}>
                    <LogIn />
                    {loading ? "Checking session..." : "Continue with Google"}
                </Button>
                <p className="text-xs text-muted-foreground">
                    By continuing you agree to our privacy-first handling of
                    your speaking data.
                </p>

                {authError ? (
                    <p className="text-xs text-destructive" role="alert">
                        {authError}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
