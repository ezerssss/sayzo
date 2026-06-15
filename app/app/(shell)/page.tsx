"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { OverviewView } from "@/components/app/overview-view";
import { useAuthUser } from "@/hooks/use-auth-user";

export default function OverviewPage() {
    const { user } = useAuthUser();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Focus is now its own route; honor legacy ?tab=focus deep-links (old
    // desktop-agent notifications / bookmarks) by redirecting to /app/focus.
    const tab = searchParams.get("tab");
    useEffect(() => {
        if (tab === "focus") router.replace("/app/focus");
    }, [tab, router]);

    if (!user) return null;
    if (tab === "focus") return null;

    return <OverviewView />;
}
