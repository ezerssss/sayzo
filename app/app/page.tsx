"use client";

import { useSearchParams } from "next/navigation";

import { SessionsDashboard } from "@/components/session/sessions-dashboard";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAuthUser } from "@/hooks/use-auth-user";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

export default function DashboardPage() {
    const { user, signOut } = useAuthUser();
    const searchParams = useSearchParams();
    const {
        captures,
        loading: capturesLoading,
        error: capturesError,
    } = useAllCaptures(user?.uid);

    if (!user) return null;

    const tabParam = searchParams.get("tab");
    const defaultTab: "captures" | "focus" =
        tabParam === "focus" ? "focus" : "captures";

    const handleDeleteCapture = async (captureId: string) => {
        try {
            await api.delete(`/api/captures/${captureId}`, {
                timeout: 30_000,
            });
        } catch (err) {
            throw new Error(
                await getKyErrorMessage(err, "Could not delete conversation."),
            );
        }
    };

    return (
        <SessionsDashboard
            uid={user.uid}
            captures={captures}
            capturesLoading={capturesLoading}
            capturesError={capturesError}
            defaultTab={defaultTab}
            onSignOut={signOut}
            onDeleteCapture={handleDeleteCapture}
        />
    );
}
