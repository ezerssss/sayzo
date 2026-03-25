"use client";

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
                <h1 className="text-2xl font-semibold tracking-tight">
                    eloquy
                </h1>
                <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                    <p>Get better with repitition.</p>
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
                <Button disabled={loading} onClick={onSignInWithGoogle}>
                    <LogIn />
                    {loading ? "Checking session..." : "Continue with Google"}
                </Button>

                {authError ? (
                    <p className="text-xs text-destructive" role="alert">
                        {authError}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
