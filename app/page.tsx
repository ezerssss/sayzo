"use client";

import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserProfileExists } from "@/hooks/use-user-profile-exists";

export default function Home() {
    const { user, loading, authError, signInWithGoogle, signOut } =
        useAuthUser();
    const { loading: profileLoading, exists: profileExists } =
        useUserProfileExists(user?.uid);

    let content: ReactNode;

    if (loading) {
        content = (
            <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <p className="text-sm text-muted-foreground">
                    Checking session…
                </p>
            </section>
        );
    } else if (!user) {
        content = (
            <GoogleLoginPanel
                loading={loading}
                authError={authError}
                onSignInWithGoogle={signInWithGoogle}
            />
        );
    } else if (profileLoading || profileExists === null) {
        content = (
            <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <p className="text-sm text-muted-foreground">
                    Loading your profile…
                </p>
            </section>
        );
    } else if (profileExists === false) {
        content = <SetupWizard />;
    } else {
        content = (
            <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <div className="space-y-3">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        You&apos;re in
                    </h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Signed in as{" "}
                        <span className="font-medium text-foreground">
                            {user.displayName ?? user.email}
                        </span>
                        {"."}
                    </p>
                </div>
                <div className="mt-6">
                    <Button onClick={signOut} variant="outline">
                        <LogOut />
                        Sign out
                    </Button>
                </div>
                {authError ? (
                    <p className="mt-3 text-xs text-destructive" role="alert">
                        {authError}
                    </p>
                ) : null}
            </section>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            {content}
        </main>
    );
}
