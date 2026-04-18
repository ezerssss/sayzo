"use client";

import Image from "next/image";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PropsInterface {
    loading: boolean;
    authError: string | null;
    onSignInWithGoogle: () => void;
    buttonLabel?: string;
    disabled?: boolean;
}

export function GoogleLoginPanel(props: Readonly<PropsInterface>) {
    const { loading, authError, onSignInWithGoogle, buttonLabel, disabled } =
        props;

    return (
        <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card px-8 py-12 shadow-sm">
            <div className="space-y-6">
                <div className="flex justify-center">
                    <Image
                        src="/sayzo-logo.png"
                        alt="Sayzo logo"
                        width={96}
                        height={96}
                        priority
                        className="rounded-xl"
                    />
                </div>
                <div className="space-y-3 text-center text-sm leading-relaxed text-muted-foreground">
                    <p>
                        Your English coach — tuned to how you actually speak.
                    </p>
                    <p>
                        Sign in to start practicing. Short drills, real
                        feedback, built for the situations in your week.
                    </p>
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
                <Button
                    disabled={disabled ?? loading}
                    onClick={onSignInWithGoogle}
                >
                    <LogIn />
                    {buttonLabel ??
                        (loading
                            ? "Checking session..."
                            : "Continue with Google")}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
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
