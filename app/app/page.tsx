"use client";

import ky from "ky";
import { useRouter, useSearchParams } from "next/navigation";

import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { SessionsDashboard } from "@/components/session/sessions-dashboard";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAllSessions } from "@/hooks/use-all-sessions";
import { useAuthUser } from "@/hooks/use-auth-user";
import { track } from "@/lib/analytics/client";
import { getKyErrorMessage, isKyHttpStatus } from "@/lib/ky-error-message";

export default function DashboardPage() {
    const { user, signOut } = useAuthUser();
    const router = useRouter();
    const searchParams = useSearchParams();
    const creditGate = useCreditGate();
    const { sessions, practiceSessions, loading, error } = useAllSessions(
        user?.uid,
    );
    const {
        captures,
        loading: capturesLoading,
        error: capturesError,
    } = useAllCaptures(user?.uid);

    if (!user) return null;

    const tabParam = searchParams.get("tab");
    const defaultTab: "drills" | "captures" | "focus" =
        tabParam === "captures"
            ? "captures"
            : tabParam === "focus"
              ? "focus"
              : "drills";

    const handleStartNewDrill = async (category?: string) => {
        if (!creditGate.guard()) {
            track("credit_limit_reached", { feature: "drill" });
            return;
        }
        const json: Record<string, string> = { uid: user.uid };
        if (category) json.category = category;
        try {
            await ky.post("/api/sessions/new-drill", {
                json,
                timeout: 330_000,
            });
            track("drill_started", {
                skill_target: null,
                category: category ?? null,
            });
            track("credit_consumed", { feature: "drill" });
            router.push("/app/drills/latest");
        } catch (err) {
            if (isKyHttpStatus(err, 402)) {
                track("credit_limit_reached", { feature: "drill" });
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

    const handleDeleteCapture = async (captureId: string) => {
        try {
            await ky.delete(`/api/captures/${captureId}`, {
                json: { uid: user.uid },
                timeout: 30_000,
            });
        } catch (err) {
            throw new Error(
                await getKyErrorMessage(err, "Could not delete capture."),
            );
        }
    };

    return (
        <SessionsDashboard
            uid={user.uid}
            sessions={sessions}
            practiceSessions={practiceSessions}
            loading={loading}
            error={error}
            captures={captures}
            capturesLoading={capturesLoading}
            capturesError={capturesError}
            defaultTab={defaultTab}
            onSignOut={signOut}
            onStartNewDrill={handleStartNewDrill}
            onDeleteSession={handleDeleteSession}
            onDeleteCapture={handleDeleteCapture}
        />
    );
}
