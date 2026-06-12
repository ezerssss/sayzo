"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { FirestoreCollections } from "@/schemas";
import { db } from "@/lib/firebase/client";
import type { UserProfileType } from "@/schemas";

type UseSeenTourStepsResult = {
    loading: boolean;
    seen: ReadonlySet<string>;
};

const EMPTY_SEEN: ReadonlySet<string> = new Set();

/**
 * Real-time subscription to `users/{uid}.seenTourSteps` — the page-guide
 * steps this user has already been shown. Missing doc/field → empty set
 * (pre-rollout users have never seen anything).
 *
 * The tour must not arm while `loading` is true: arming on the empty
 * placeholder would re-show the full guide to users whose snapshot simply
 * hadn't landed yet.
 */
export function useSeenTourSteps(
    uid: string | undefined,
): UseSeenTourStepsResult {
    const [state, setState] = useState<UseSeenTourStepsResult>(() =>
        uid
            ? { loading: true, seen: EMPTY_SEEN }
            : { loading: false, seen: EMPTY_SEEN },
    );

    useEffect(() => {
        if (!uid) {
            return;
        }

        const ref = doc(db, FirestoreCollections.users.path, uid);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const data = snap.exists()
                    ? (snap.data() as Partial<UserProfileType>)
                    : null;
                const ids = Array.isArray(data?.seenTourSteps)
                    ? data.seenTourSteps.filter(
                          (s): s is string => typeof s === "string",
                      )
                    : [];
                setState({ loading: false, seen: new Set(ids) });
            },
            (error) => {
                console.error("[useSeenTourSteps]", error);
                // Read failed → worst case a user re-sees a step once.
                setState({ loading: false, seen: EMPTY_SEEN });
            },
        );

        return unsub;
    }, [uid]);

    return state;
}
