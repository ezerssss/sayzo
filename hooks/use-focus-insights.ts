"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { api } from "@/lib/api-client";
import { db } from "@/lib/firebase/client";
import type { UserFocusInsights } from "@/types/focus-insights";

type UseFocusInsightsResult = {
    insights: UserFocusInsights | null;
    /** True while waiting for the first Firestore snapshot. */
    loading: boolean;
    /** True while a synthesize request is in-flight. */
    refreshing: boolean;
    error: string | null;
    /** Manually trigger a forced regeneration. */
    refresh: () => Promise<void>;
};

export function useFocusInsights(uid: string | undefined): UseFocusInsightsResult {
    const [insights, setInsights] = useState<UserFocusInsights | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const autoRefreshedForUidRef = useRef<string | null>(null);

    const runRefresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            await api.post("/api/focus/refresh", {
                json: {},
                timeout: 120_000,
            });
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Could not refresh focus insights.";
            setError(message);
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (!uid) {
            setInsights(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        const ref = doc(db, FirestoreCollections.userFocusInsights.path, uid);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                if (snap.exists()) {
                    setInsights(snap.data() as UserFocusInsights);
                } else {
                    setInsights(null);
                }
                setLoading(false);
            },
            () => {
                setError("Could not load your focus view.");
                setLoading(false);
            },
        );

        return () => {
            unsub();
        };
    }, [uid]);

    // Fire a single background refresh per uid on mount so new sessions /
    // captures get folded into the view. The server checks for new items and
    // short-circuits (no LLM call) when nothing has changed.
    useEffect(() => {
        if (!uid) return;
        if (autoRefreshedForUidRef.current === uid) return;
        autoRefreshedForUidRef.current = uid;
        void runRefresh();
    }, [uid, runRefresh]);

    const refresh = useCallback(async () => {
        if (!uid) return;
        await runRefresh();
    }, [uid, runRefresh]);

    return { insights, loading, refreshing, error, refresh };
}
