"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { SessionType } from "@/types/sessions";

/**
 * Real-time listener for a single session document by ID.
 * Used when navigating to a specific session (e.g. conversation practice)
 * rather than relying on "latest session" logic.
 *
 * No-ops when sessionId is undefined.
 */
export function useSession(sessionId?: string) {
    const [session, setSession] = useState<SessionType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) {
            setSession(null);
            setLoading(false);
            return;
        }

        setLoading(true);

        const docRef = doc(
            db,
            FirestoreCollections.sessions.path,
            sessionId,
        );

        const unsub = onSnapshot(
            docRef,
            (snap) => {
                if (snap.exists()) {
                    setSession({
                        ...(snap.data() as SessionType),
                        id: snap.id,
                    });
                } else {
                    setSession(null);
                }
                setLoading(false);
            },
            () => {
                setError("Could not load session.");
                setLoading(false);
            },
        );

        return unsub;
    }, [sessionId]);

    return { session, loading, error };
}
