"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type {
    OnboardingDrillProgress,
    UserProfileType,
} from "@/types/user";

export function useUserProfileExists(uid: string | undefined) {
    const [loading, setLoading] = useState(Boolean(uid));
    const [exists, setExists] = useState<boolean | null>(null);
    const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
        null,
    );
    const [onboardingStatus, setOnboardingStatus] = useState<
        UserProfileType["onboardingStatus"] | null
    >(null);
    const [onboardingDrills, setOnboardingDrills] = useState<
        OnboardingDrillProgress[]
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
                    setOnboardingDrills(
                        Array.isArray(data.onboardingDrills)
                            ? data.onboardingDrills
                            : [],
                    );
                    setFirstDrillCompletedAt(
                        data.firstDrillCompletedAt ?? null,
                    );
                } else {
                    setOnboardingComplete(false);
                    setOnboardingStatus(null);
                    setOnboardingDrills([]);
                    setFirstDrillCompletedAt(null);
                }
                setLoading(false);
            },
            (error) => {
                console.error(error);
                setExists(false);
                setOnboardingComplete(false);
                setOnboardingStatus(null);
                setOnboardingDrills([]);
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
        onboardingDrills,
        firstDrillCompletedAt,
    };
}
