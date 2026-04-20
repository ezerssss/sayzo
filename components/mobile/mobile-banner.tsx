"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics/client";
import { useIsMobile } from "@/lib/device/is-mobile";

import { SaveLinkActions } from "./save-link-actions";

const DISMISS_KEY = "sayzo.mobile.bannerDismissedAt";

type Props = {
    page: "landing" | "app";
};

export function MobileBanner({ page }: Props) {
    const isMobile = useIsMobile();
    const [dismissed, setDismissed] = useState(false);
    const [dismissalChecked, setDismissalChecked] = useState(false);
    const detectedRef = useRef(false);

    useEffect(() => {
        let wasDismissed = false;
        try {
            wasDismissed = Boolean(window.localStorage.getItem(DISMISS_KEY));
        } catch {
            // Storage blocked (private mode) — show banner, don't persist.
        }
        // Client-only read after hydration; SSR renders the dismissed-hidden state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (wasDismissed) setDismissed(true);
        setDismissalChecked(true);
    }, []);

    useEffect(() => {
        if (!isMobile || detectedRef.current) return;
        detectedRef.current = true;
        track("mobile_visitor_detected", { page });
    }, [isMobile, page]);

    if (!isMobile || !dismissalChecked || dismissed) return null;

    const handleDismiss = () => {
        try {
            window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
            // best-effort
        }
        track("mobile_banner_dismissed", { page });
        setDismissed(true);
    };

    return (
        <div className="sticky top-0 z-40 border-b border-border/70 bg-background/90 px-3 py-2 text-xs backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center gap-2">
                <p className="flex-1 truncate font-medium">
                    Sayzo works best on desktop
                </p>
                <SaveLinkActions source="banner" layout="inline" />
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Dismiss mobile banner"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <X className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
