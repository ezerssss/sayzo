"use client";

import { CapturesEmptyState } from "@/components/app/captures-empty-state";
import { CapturesList } from "@/components/app/captures-list";
import { Eyebrow } from "@/components/app/eyebrow";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAuthUser } from "@/hooks/use-auth-user";

/**
 * The full "All conversations" list — the home for the rail's "View all" link.
 * Keeps the rail capped to recent calls while still giving a complete archive.
 */
export default function AllConversationsPage() {
    const { user } = useAuthUser();
    const { captures, loading, error } = useAllCaptures(user?.uid);

    if (!user) return null;

    return (
        <div className="space-y-6">
            <div>
                <Eyebrow>Your conversations</Eyebrow>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    All conversations
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Real conversations from your calls. Open any to get feedback
                    and replay the moments that matter.
                </p>
            </div>

            {loading && captures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Loading your conversations…
                </p>
            ) : error ? (
                <p className="text-sm text-destructive" role="alert">
                    {error}
                </p>
            ) : captures.length === 0 ? (
                <CapturesEmptyState />
            ) : (
                <CapturesList captures={captures} />
            )}
        </div>
    );
}
