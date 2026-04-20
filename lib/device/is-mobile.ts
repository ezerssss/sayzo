"use client";

import { useEffect, useState } from "react";

const MOBILE_UA_RE = /iphone|ipod|android.+mobile|windows phone|blackberry|iemobile/i;

export function isMobileUA(ua?: string): boolean {
    if (typeof ua !== "string") return false;
    if (MOBILE_UA_RE.test(ua)) return true;
    // iPadOS 13+ reports Macintosh UA but has a touchscreen.
    if (
        typeof navigator !== "undefined" &&
        navigator.maxTouchPoints > 1 &&
        /Macintosh/.test(ua)
    ) {
        return true;
    }
    return false;
}

/**
 * Returns false on SSR + first client render, then updates after mount.
 * Matches the `detectOS` pattern in components/install/install-panel.tsx
 * to avoid hydration mismatch for a non-security UA check.
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (typeof navigator === "undefined") return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMobile(isMobileUA(navigator.userAgent));
    }, []);

    return isMobile;
}
