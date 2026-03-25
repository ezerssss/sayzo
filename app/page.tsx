"use client";

import type { ReactNode } from "react";

import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { SessionHome } from "@/components/session/session-home";
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
        content = <SetupWizard uid={user.uid} />;
    } else {
        content = (
            <SessionHome
                uid={user.uid}
                userLabel={user.displayName ?? user.email ?? "Unknown user"}
                onSignOut={signOut}
                authError={authError}
            />
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            {content}
        </main>
    );
}
