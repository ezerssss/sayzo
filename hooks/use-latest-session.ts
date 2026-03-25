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
            limit(1),
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                if (snap.empty) {
                    setSession(null);
                } else {
                    setSession(snap.docs[0]?.data() as SessionType);
                }
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
