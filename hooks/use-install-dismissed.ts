"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sayzo:install-prompt-dismissed";

export function useInstallDismissed() {
    const [dismissed, setDismissed] = useState<boolean | null>(null);

    useEffect(() => {
        try {
            setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
            setDismissed(false);
        }
    }, []);

    const dismiss = useCallback(() => {
        try {
            localStorage.setItem(STORAGE_KEY, "1");
        } catch {
            // Non-fatal — panel still dismisses for this session
        }
        setDismissed(true);
    }, []);

    const reset = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            // Non-fatal
        }
        setDismissed(false);
    }, []);

    return { dismissed, dismiss, reset };
}
