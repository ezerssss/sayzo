"use client";

import { useEffect, useRef } from "react";

import { CREDIT_WARN_THRESHOLD } from "@/constants/credits";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserCredits } from "@/hooks/use-user-credits";
import { identifyUser, setUserProps, track } from "@/lib/analytics/client";

/**
 * Mounted once in the root layout. Keeps the analytics user_id and user
 * properties in sync with Firebase Auth + the user credits Firestore doc,
 * and fires threshold-crossing events (warning when remaining ≤ 3).
 */
export function AnalyticsUserSync() {
    const { user } = useAuthUser();
    const credits = useUserCredits(user?.uid);
    const prevRemainingRef = useRef<number | null>(null);
    const lastIdentifiedUidRef = useRef<string | null>(null);

    useEffect(() => {
        const uid = user?.uid ?? null;
        if (lastIdentifiedUidRef.current === uid) return;
        lastIdentifiedUidRef.current = uid;
        identifyUser(uid);
    }, [user?.uid]);

    useEffect(() => {
        if (!user || credits.loading) return;
        setUserProps({
            platform_web: "web",
            has_full_access: credits.hasFullAccess,
            credits_used: credits.used,
            credits_limit: credits.limit,
        });

        const prev = prevRemainingRef.current;
        const curr = credits.remaining;
        const crossedIntoWarning =
            prev !== null &&
            Number.isFinite(prev) &&
            Number.isFinite(curr) &&
            prev > CREDIT_WARN_THRESHOLD &&
            curr <= CREDIT_WARN_THRESHOLD &&
            curr > 0 &&
            !credits.hasFullAccess;
        if (crossedIntoWarning) {
            track("credit_warning_shown", { credits_remaining: curr });
        }
        prevRemainingRef.current = Number.isFinite(curr) ? curr : null;
    }, [
        user,
        credits.loading,
        credits.hasFullAccess,
        credits.used,
        credits.limit,
        credits.remaining,
    ]);

    return null;
}
