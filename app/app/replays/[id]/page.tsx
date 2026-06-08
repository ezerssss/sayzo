"use client";

import { useParams } from "next/navigation";

import { SessionHome } from "@/components/session/session-home";
import { useAuthUser } from "@/hooks/use-auth-user";

export default function ReplayPage() {
    const { user, authError } = useAuthUser();
    const params = useParams<{ id: string }>();
    const sessionId = params.id;

    if (!user) return null;

    return (
        <SessionHome
            uid={user.uid}
            authError={authError}
            sessionId={sessionId}
        />
    );
}
