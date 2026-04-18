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
import type { CaptureType } from "@/types/captures";

export function useAllCaptures(uid?: string) {
    const [captures, setCaptures] = useState<CaptureType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!uid) {
            return;
        }

        const q = query(
            collection(db, FirestoreCollections.captures.path),
            where("uid", "==", uid),
            orderBy("startedAt", "desc"),
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                const docs = snap.docs.map((doc) => ({
                    ...(doc.data() as CaptureType),
                    id: doc.id,
                }));
                setCaptures(docs);
                setLoading(false);
            },
            () => {
                setError("Could not load your captures.");
                setLoading(false);
            },
        );

        return unsub;
    }, [uid]);

    return { captures, loading, error };
}
