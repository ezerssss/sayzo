"use client";

import { useCallback, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut as firebaseSignOut,
    User,
} from "firebase/auth";

import { auth, googleProvider } from "@/lib/firebase/client";

export function useAuthUser() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
            setUser(nextUser);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const signInWithGoogle = useCallback(async () => {
        setAuthError(null);

        try {
            await signInWithPopup(auth, googleProvider);
        } catch (error) {
            console.error(error);
            setAuthError("Unable to sign in with Google right now.");
        }
    }, []);

    const signOut = useCallback(async () => {
        setAuthError(null);

        try {
            await firebaseSignOut(auth);
        } catch (error) {
            console.error(error);
            setAuthError("Unable to sign out right now.");
        }
    }, []);

    return {
        user,
        loading,
        authError,
        signInWithGoogle,
        signOut,
    };
}
