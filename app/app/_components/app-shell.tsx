"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { AuthScreen } from "@/components/auth/auth-screen";
import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { CreditGateProvider } from "@/components/credits/credit-gate-provider";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserProfileExists } from "@/hooks/use-user-profile-exists";

const ONBOARDING_PATH = "/app/onboarding";

export function AppShell({ children }: { children: ReactNode }) {
    const { user, loading, authError, signInWithGoogle } = useAuthUser();
    const {
        loading: profileLoading,
        exists,
        onboardingComplete,
        onboardingStatus,
    } = useUserProfileExists(user?.uid);
    const pathname = usePathname();
    const router = useRouter();

    const profileReady = Boolean(user) && !profileLoading && exists !== null;
    const needsOnboarding =
        profileReady &&
        (exists === false ||
            onboardingComplete === false ||
            onboardingStatus === "processing");
    const onOnboardingRoute = pathname === ONBOARDING_PATH;

    useEffect(() => {
        if (!profileReady) return;
        if (needsOnboarding && !onOnboardingRoute) {
            router.replace(ONBOARDING_PATH);
        } else if (!needsOnboarding && onOnboardingRoute) {
            router.replace("/app");
        }
    }, [profileReady, needsOnboarding, onOnboardingRoute, router]);

    if (loading) {
        return <LoadingCard>Checking session&hellip;</LoadingCard>;
    }

    if (!user) {
        return (
            <GoogleLoginPanel
                loading={loading}
                authError={authError}
                onSignInWithGoogle={signInWithGoogle}
            />
        );
    }

    if (!profileReady) {
        return <LoadingCard>Loading your profile&hellip;</LoadingCard>;
    }

    if (needsOnboarding && !onOnboardingRoute) {
        return <LoadingCard>Redirecting&hellip;</LoadingCard>;
    }

    if (!needsOnboarding && onOnboardingRoute) {
        return <LoadingCard>Redirecting&hellip;</LoadingCard>;
    }

    return <CreditGateProvider>{children}</CreditGateProvider>;
}

function LoadingCard({ children }: { children: ReactNode }) {
    return (
        <AuthScreen>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{children}</span>
            </div>
        </AuthScreen>
    );
}
