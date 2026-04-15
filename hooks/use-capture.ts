"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { CaptureType } from "@/types/captures";

export function useCapture(captureId?: string, initial?: CaptureType) {
    const [capture, setCapture] = useState<CaptureType | null>(initial ?? null);
    const [loading, setLoading] = useState(!initial);

    useEffect(() => {
        if (!captureId) return;

        const docRef = doc(
            db,
            FirestoreCollections.captures.path,
            captureId,
        );

        const unsub = onSnapshot(
            docRef,
            (snap) => {
                if (snap.exists()) {
                    setCapture({
                        ...(snap.data() as CaptureType),
                        id: snap.id,
                    });
                }
                setLoading(false);
            },
            () => {
                setLoading(false);
            },
        );

        return unsub;
    }, [captureId]);

    return { capture, loading };
}
