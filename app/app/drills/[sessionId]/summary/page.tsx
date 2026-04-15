"use client";

import { useParams } from "next/navigation";

import { PastSessionView } from "@/components/session/past-session-view";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useSession } from "@/hooks/use-session";

export default function DrillSummaryPage() {
    const { user } = useAuthUser();
    const params = useParams<{ sessionId: string }>();
    const { session, loading, error } = useSession(params.sessionId);

    if (!user) return null;

    if (loading) {
        return (
            <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <p className="text-sm text-muted-foreground">Loading drill…</p>
            </section>
        );
    }

    if (error || !session) {
        return (
            <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <p className="text-sm text-destructive" role="alert">
                    {error ?? "Drill not found."}
                </p>
            </section>
        );
    }

    return <PastSessionView session={session} uid={user.uid} />;
}
