"use client";

import { useEffect } from "react";

import { isMobileUA } from "@/lib/device/is-mobile";
import { setUserProps } from "@/lib/analytics/client";

/**
 * Mounted once in the root layout. Tags the analytics session with a
 * device_type user property so every event gets a mobile/desktop dimension
 * for segmentation — no per-call-site changes required.
 */
export function AnalyticsDeviceSync() {
    useEffect(() => {
        if (typeof navigator === "undefined") return;
        const mobile = isMobileUA(navigator.userAgent);
        setUserProps({ device_type: mobile ? "mobile" : "desktop" });
    }, []);

    return null;
}
