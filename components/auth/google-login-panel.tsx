"use client";

import { LogIn, LogOut } from "lucide-react";

import { useAuthUser } from "@/hooks/use-auth-user";
import { Button } from "@/components/ui/button";

export function GoogleLoginPanel() {
    const { user, loading, authError, signInWithGoogle, signOut } =
        useAuthUser();

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
                {user ? (
                    <>
                        <p className="text-sm">
                            Signed in as{" "}
                            <span className="font-medium">
                                {user.displayName ?? user.email}
                            </span>
                        </p>
                        <Button onClick={signOut} variant="outline">
                            <LogOut />
                            Sign out
                        </Button>
                    </>
                ) : (
                    <Button disabled={loading} onClick={signInWithGoogle}>
                        <LogIn />
                        {loading
                            ? "Checking session..."
                            : "Continue with Google"}
                    </Button>
                )}

                {authError ? (
                    <p className="text-xs text-destructive" role="alert">
                        {authError}
                    </p>
                ) : null}
            </div>
        </section>
    );
}
