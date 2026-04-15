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

export function usePracticeSessionForCapture(
    uid: string | undefined,
    captureId: string | undefined,
) {
    const [session, setSession] = useState<SessionType | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!uid || !captureId) return;

        const q = query(
            collection(db, FirestoreCollections.sessions.path),
            where("uid", "==", uid),
            where("sourceCaptureId", "==", captureId),
            orderBy("createdAt", "desc"),
            limit(1),
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                const first = snap.docs[0];
                if (first) {
                    setSession({
                        ...(first.data() as SessionType),
                        id: first.id,
                    });
                } else {
                    setSession(null);
                }
                setLoading(false);
            },
            () => {
                setLoading(false);
            },
        );

        return unsub;
    }, [uid, captureId]);

    return { session, loading };
}
