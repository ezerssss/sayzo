"use client";

import { useParams } from "next/navigation";

import { SessionHome } from "@/components/session/session-home";
import { useAuthUser } from "@/hooks/use-auth-user";

export default function DrillPage() {
    const { user, signOut, authError } = useAuthUser();
    const params = useParams<{ sessionId: string }>();
    const rawSessionId = params.sessionId;
    const sessionId = rawSessionId === "latest" ? undefined : rawSessionId;

    if (!user) return null;

    return (
        <SessionHome
            uid={user.uid}
            userLabel={user.displayName ?? user.email ?? "Unknown user"}
            onSignOut={signOut}
            authError={authError}
            sessionId={sessionId}
        />
    );
}
