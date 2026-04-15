"use client";

import { useEffect, useState } from "react";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { SessionType } from "@/types/sessions";

export function useAllSessions(uid?: string) {
    const [sessions, setSessions] = useState<SessionType[]>([]);
    const [practiceSessions, setPracticeSessions] = useState<SessionType[]>([]);
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
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                const all = snap.docs.map((doc) => ({
                    ...(doc.data() as SessionType),
                    id: doc.id,
                }));
                setSessions(all.filter((s) => s.type !== "scenario_replay"));
                setPracticeSessions(
                    all.filter((s) => s.type === "scenario_replay"),
                );
                setLoading(false);
            },
            () => {
                setError("Could not load your sessions.");
                setLoading(false);
            },
        );

        return unsub;
    }, [uid]);

    return { sessions, practiceSessions, loading, error };
}
