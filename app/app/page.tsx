"use client";

import ky from "ky";
import { useRouter } from "next/navigation";

import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { SessionsDashboard } from "@/components/session/sessions-dashboard";
import { useAllSessions } from "@/hooks/use-all-sessions";
import { useAuthUser } from "@/hooks/use-auth-user";
import { getKyErrorMessage, isKyHttpStatus } from "@/lib/ky-error-message";

export default function DashboardPage() {
    const { user, signOut } = useAuthUser();
    const router = useRouter();
    const creditGate = useCreditGate();
    const { sessions, practiceSessions, loading, error } = useAllSessions(
        user?.uid,
    );

    if (!user) return null;

    const handleStartNewDrill = async (category?: string) => {
        if (!creditGate.guard()) return;
        const json: Record<string, string> = { uid: user.uid };
        if (category) json.category = category;
        try {
            await ky.post("/api/sessions/new-drill", {
                json,
                timeout: 330_000,
            });
            router.push("/app/drills/latest");
        } catch (err) {
            if (isKyHttpStatus(err, 402)) {
                creditGate.openLimitDialog();
                return;
            }
            throw new Error(
                await getKyErrorMessage(err, "Could not create a new drill."),
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
                await getKyErrorMessage(err, "Could not delete session."),
            );
        }
    };

    return (
        <SessionsDashboard
            sessions={sessions}
            practiceSessions={practiceSessions}
            loading={loading}
            error={error}
            userLabel={user.displayName ?? user.email ?? "Unknown user"}
            onSignOut={signOut}
            onStartNewDrill={handleStartNewDrill}
            onDeleteSession={handleDeleteSession}
        />
    );
}
