"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { CaptureType } from "@/types/captures";

/**
 * Real-time listener for a single capture document. Returns the latest
 * snapshot so the detail view updates live as the pipeline progresses
 * (queued → transcribing → … → analyzed).
 *
 * Takes an initial value so the UI renders instantly from the list data,
 * then the listener keeps it in sync with Firestore.
 */
export function useCapture(captureId: string | undefined, initial: CaptureType) {
    const [capture, setCapture] = useState<CaptureType>(initial);

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
            },
            () => {
                // On error, keep using whatever we have
            },
        );

        return unsub;
    }, [captureId]);

    return capture;
}
