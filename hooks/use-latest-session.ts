"use client";

import { useEffect, useState } from "react";
import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { SessionType } from "@/types/sessions";

export function useLatestSession(uid?: string) {
    const [session, setSession] = useState<SessionType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!uid) {
            return;
        }

        const q = query(
            collection(db, FirestoreCollections.sessions.path),
            where("uid", "==", uid),
            orderBy("createdAt", "desc"),
            limit(10),
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                // Find the first regular drill (skip conversation practice sessions)
                const latest = snap.docs
                    .map((d) => d.data() as SessionType)
                    .find((s) => s.type !== "scenario_replay");
                setSession(latest ?? null);
                setLoading(false);
            },
            () => {
                setError("Could not load latest drill.");
                setLoading(false);
            },
        );

        return unsub;
    }, [uid]);

    return { session, loading, error };
}
