"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import type { UserProfileType } from "@/types/user";

type UseIsAdminResult = {
    isAdmin: boolean | null;
    loading: boolean;
};

/**
 * Real-time subscription to `users/{uid}.isAdmin`. Used by the admin shell
 * to gate the UI. The actual security boundary is server-side (`requireAdmin`)
 * + the Firestore rules `isAdmin()` helper — this hook is UX only.
 *
 * `null` means "we don't know yet" (loading or signed-out); use that to
 * render nothing rather than flashing a redirect.
 */
export function useIsAdmin(uid: string | undefined): UseIsAdminResult {
    const [state, setState] = useState<UseIsAdminResult>(() =>
        uid
            ? { isAdmin: null, loading: true }
            : { isAdmin: null, loading: false },
    );

    useEffect(() => {
        if (!uid) {
            return;
        }

        const ref = doc(db, FirestoreCollections.users.path, uid);
        const unsub = onSnapshot(
            ref,
            (snap) => {
                if (!snap.exists()) {
                    setState({ isAdmin: false, loading: false });
                    return;
                }
                const data = snap.data() as Partial<UserProfileType>;
                setState({ isAdmin: data.isAdmin === true, loading: false });
            },
            () => {
                setState({ isAdmin: false, loading: false });
            },
        );

        return unsub;
    }, [uid]);

    // When `uid` flips back to undefined, fall back to the not-loading state.
    // Done via a key derived from uid rather than setState-in-effect to keep
    // the React-hooks lint rule happy.
    const result =
        !uid && state.loading
            ? ({ isAdmin: null, loading: false } as UseIsAdminResult)
            : state;
    return result;
}
