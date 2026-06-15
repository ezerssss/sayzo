"use client";

import { FocusDashboard } from "@/components/focus/focus-dashboard";
import { useAuthUser } from "@/hooks/use-auth-user";

export default function FocusPage() {
    const { user } = useAuthUser();

    if (!user) return null;

    return <FocusDashboard uid={user.uid} />;
}
