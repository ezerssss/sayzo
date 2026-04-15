"use client";

import ky from "ky";

import { ConversationsDashboard } from "@/components/conversations/conversations-dashboard";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAuthUser } from "@/hooks/use-auth-user";
import { getKyErrorMessage } from "@/lib/ky-error-message";

export default function ConversationsPage() {
    const { user, signOut } = useAuthUser();
    const { captures, loading, error } = useAllCaptures(user?.uid);

    if (!user) return null;

    const handleDeleteCapture = async (captureId: string) => {
        try {
            await ky.delete(`/api/captures/${captureId}`, {
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

    return (
        <ConversationsDashboard
            captures={captures}
            loading={loading}
            error={error}
            userLabel={user.displayName ?? user.email ?? "Unknown user"}
            onSignOut={signOut}
            onDeleteCapture={handleDeleteCapture}
        />
    );
}
