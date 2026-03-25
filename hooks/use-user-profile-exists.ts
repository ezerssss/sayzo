"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";

export function useUserProfileExists(uid: string | undefined) {
    const [loading, setLoading] = useState(Boolean(uid));
    const [exists, setExists] = useState<boolean | null>(null);

    useEffect(() => {
        if (!uid) {
            return;
        }

        const ref = doc(db, FirestoreCollections.users.path, uid);
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                setExists(snapshot.exists());
                setLoading(false);
            },
            (error) => {
                console.error(error);
                setExists(false);
                setLoading(false);
            },
        );

        return unsubscribe;
    }, [uid]);

    return { loading, exists };
}
