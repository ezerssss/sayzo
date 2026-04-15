"use client";

import ky from "ky";
import type { ReactNode } from "react";
import { useState } from "react";

import { GoogleLoginPanel } from "@/components/auth/google-login-panel";
import { ConversationDetailView } from "@/components/conversations/conversation-detail-view";
import { ConversationsDashboard } from "@/components/conversations/conversations-dashboard";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { PastSessionView } from "@/components/session/past-session-view";
import { SessionHome } from "@/components/session/session-home";
import { SessionsDashboard } from "@/components/session/sessions-dashboard";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAllSessions } from "@/hooks/use-all-sessions";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserProfileExists } from "@/hooks/use-user-profile-exists";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { CaptureType } from "@/types/captures";
import type { SessionType } from "@/types/sessions";

type AppView =
    | { mode: "dashboard" }
    | { mode: "drill"; sessionId?: string }
    | { mode: "past-session"; session: SessionType }
    | { mode: "conversations" }
    | { mode: "conversation-detail"; capture: CaptureType };

export default function Home() {
    const { user, loading, authError, signInWithGoogle, signOut } =
        useAuthUser();
    const {
        loading: profileLoading,
        exists: profileExists,
        onboardingComplete,
        onboardingStatus,
        onboardingDrills,
    } = useUserProfileExists(user?.uid);

    const [appView, setAppView] = useState<AppView>({ mode: "dashboard" });

    const {
        sessions,
        practiceSessions,
        loading: sessionsLoading,
        error: sessionsError,
    } = useAllSessions(user?.uid);

    const {
        captures,
        loading: capturesLoading,
        error: capturesError,
    } = useAllCaptures(user?.uid);

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
    } else if (
        profileExists === false ||
        onboardingComplete === false ||
        onboardingStatus === "processing"
    ) {
        content = (
            <SetupWizard
                uid={user.uid}
                savedDrills={onboardingDrills}
            />
        );
    } else if (appView.mode === "conversations") {
        const handleDeleteCapture = async (captureId: string) => {
            try {
                await ky
                    .delete(`/api/captures/${captureId}`, {
                        json: { uid: user.uid },
                        timeout: 30_000,
                    });
            } catch (err) {
                throw new Error(
                    await getKyErrorMessage(
                        err,
                        "Could not delete real conversation.",
                    ),
                );
            }
        };

        content = (
            <ConversationsDashboard
                captures={captures}
                loading={capturesLoading}
                error={capturesError}
                userLabel={user.displayName ?? user.email ?? "Unknown user"}
                onSignOut={signOut}
                onBackToDrills={() => setAppView({ mode: "dashboard" })}
                onSelectCapture={(capture) =>
                    setAppView({ mode: "conversation-detail", capture })
                }
                onDeleteCapture={handleDeleteCapture}
            />
        );
    } else if (appView.mode === "conversation-detail") {
        const handlePracticeConversation = async (captureId: string) => {
            try {
                const res = await ky
                    .post(`/api/captures/${captureId}/practice`, {
                        json: { uid: user.uid },
                        timeout: 60_000,
                    })
                    .json<{ sessionId: string }>();
                setAppView({ mode: "drill", sessionId: res.sessionId });
            } catch (err) {
                throw new Error(
                    await getKyErrorMessage(
                        err,
                        "Could not create practice session.",
                    ),
                );
            }
        };

        const handleDeleteCapture = async (captureId: string) => {
            try {
                await ky
                    .delete(`/api/captures/${captureId}`, {
                        json: { uid: user.uid },
                        timeout: 30_000,
                    });
                setAppView({ mode: "conversations" });
            } catch (err) {
                throw new Error(
                    await getKyErrorMessage(
                        err,
                        "Could not delete real conversation.",
                    ),
                );
            }
        };

        const practiceSessionForCapture = practiceSessions.find(
            (s) => s.sourceCaptureId === appView.capture.id,
        );

        content = (
            <ConversationDetailView
                capture={appView.capture}
                uid={user.uid}
                onBack={() => setAppView({ mode: "conversations" })}
                onPracticeThisConversation={handlePracticeConversation}
                onDelete={handleDeleteCapture}
                practiceSession={practiceSessionForCapture}
                onGoToPracticeSession={(sessionId) =>
                    setAppView({ mode: "drill", sessionId })
                }
            />
        );
    } else if (appView.mode === "drill") {
        content = (
            <SessionHome
                uid={user.uid}
                userLabel={user.displayName ?? user.email ?? "Unknown user"}
                onSignOut={signOut}
                authError={authError}
                onBackToDashboard={() => setAppView({ mode: "dashboard" })}
                sessionId={appView.sessionId}
            />
        );
    } else if (appView.mode === "past-session") {
        content = (
            <PastSessionView
                session={appView.session}
                uid={user.uid}
                onBack={() => setAppView({ mode: "dashboard" })}
            />
        );
    } else {
        const handleStartNewDrill = async (category?: string) => {
            const json: Record<string, string> = { uid: user.uid };
            if (category) json.category = category;
            try {
                await ky.post("/api/sessions/new-drill", {
                    json,
                    timeout: 330_000,
                });
                setAppView({ mode: "drill" });
            } catch (err) {
                throw new Error(
                    await getKyErrorMessage(
                        err,
                        "Could not create a new drill.",
                    ),
                );
            }
        };

        const handleDeleteSession = async (sessionId: string) => {
            try {
                await ky.post("/api/sessions/delete", {
                    json: { uid: user.uid, sessionId },
                    timeout: 30_000,
                });
            } catch (err) {
                throw new Error(
                    await getKyErrorMessage(
                        err,
                        "Could not delete session.",
                    ),
                );
            }
        };

        content = (
            <SessionsDashboard
                sessions={sessions}
                practiceSessions={practiceSessions}
                loading={sessionsLoading}
                error={sessionsError}
                userLabel={user.displayName ?? user.email ?? "Unknown user"}
                onSignOut={signOut}
                onSelectSession={(session) =>
                    setAppView({ mode: "past-session", session })
                }
                onGoToCurrentDrill={() => setAppView({ mode: "drill" })}
                onStartNewDrill={handleStartNewDrill}
                onDeleteSession={handleDeleteSession}
                onGoToConversations={() =>
                    setAppView({ mode: "conversations" })
                }
                onGoToPracticeSession={(sessionId) =>
                    setAppView({ mode: "drill", sessionId })
                }
            />
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            {content}
        </main>
    );
}
