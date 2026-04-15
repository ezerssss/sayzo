"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { DEFAULT_FREE_CREDIT_LIMIT } from "@/constants/credits";
import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { UserProfileType } from "@/types/user";

type UseUserCreditsResult = {
    loading: boolean;
    used: number;
    limit: number;
    remaining: number;
    hasFullAccess: boolean;
    requestedAt: string | null;
    grantedAt: string | null;
};

const EMPTY: UseUserCreditsResult = {
    loading: false,
    used: 0,
    limit: DEFAULT_FREE_CREDIT_LIMIT,
    remaining: DEFAULT_FREE_CREDIT_LIMIT,
    hasFullAccess: false,
    requestedAt: null,
    grantedAt: null,
};

export function useUserCredits(uid: string | undefined): UseUserCreditsResult {
    const [state, setState] = useState<UseUserCreditsResult>(() =>
        uid ? { ...EMPTY, loading: true } : EMPTY,
    );

    useEffect(() => {
        if (!uid) {
            return;
        }

        const ref = doc(db, FirestoreCollections.users.path, uid);
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                const data = snapshot.exists()
                    ? (snapshot.data() as Partial<UserProfileType>)
                    : null;

                const hasFullAccess = data?.hasFullAccess === true;
                const used =
                    typeof data?.creditsUsed === "number" ? data.creditsUsed : 0;
                const limit =
                    typeof data?.creditsLimit === "number"
                        ? data.creditsLimit
                        : DEFAULT_FREE_CREDIT_LIMIT;
                const remaining = hasFullAccess
                    ? Number.POSITIVE_INFINITY
                    : Math.max(0, limit - used);

                setState({
                    loading: false,
                    used,
                    limit,
                    remaining,
                    hasFullAccess,
                    requestedAt: data?.accessRequestedAt ?? null,
                    grantedAt: data?.accessGrantedAt ?? null,
                });
            },
            (error) => {
                console.error("[useUserCredits]", error);
                setState({ ...EMPTY, loading: false });
            },
        );

        return unsubscribe;
    }, [uid]);

    return state;
}
