"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { FirestoreCollections } from "@/schemas";
import { db } from "@/lib/firebase/client";
import type {
    OnboardingSampleProgress,
    UserProfileType,
} from "@/schemas";

export function useUserProfileExists(uid: string | undefined) {
    const [loading, setLoading] = useState(Boolean(uid));
    const [exists, setExists] = useState<boolean | null>(null);
    const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
        null,
    );
    const [onboardingStatus, setOnboardingStatus] = useState<
        UserProfileType["onboardingStatus"] | null
    >(null);
    const [onboardingSamples, setOnboardingSamples] = useState<
        OnboardingSampleProgress[]
    >([]);
    const [firstDrillCompletedAt, setFirstDrillCompletedAt] = useState<
        string | null
    >(null);

    useEffect(() => {
        if (!uid) {
            return;
        }

        const ref = doc(db, FirestoreCollections.users.path, uid);
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                setExists(snapshot.exists());
                if (snapshot.exists()) {
                    const data = snapshot.data() as Partial<UserProfileType>;
                    setOnboardingComplete(Boolean(data.onboardingComplete));
                    setOnboardingStatus(data.onboardingStatus ?? null);
                    setOnboardingSamples(
                        Array.isArray(data.onboardingSamples)
                            ? data.onboardingSamples
                            : [],
                    );
                    setFirstDrillCompletedAt(
                        data.firstDrillCompletedAt ?? null,
                    );
                } else {
                    setOnboardingComplete(false);
                    setOnboardingStatus(null);
                    setOnboardingSamples([]);
                    setFirstDrillCompletedAt(null);
                }
                setLoading(false);
            },
            (error) => {
                console.error(error);
                setExists(false);
                setOnboardingComplete(false);
                setOnboardingStatus(null);
                setOnboardingSamples([]);
                setFirstDrillCompletedAt(null);
                setLoading(false);
            },
        );

        return unsubscribe;
    }, [uid]);

    return {
        loading,
        exists,
        onboardingComplete,
        onboardingStatus,
        onboardingSamples,
        firstDrillCompletedAt,
    };
}
