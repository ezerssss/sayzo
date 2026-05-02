"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISSED_AT_KEY = "sayzo.installNudge.lastDismissedAt";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type Props = {
    /** Number of captures the user has. > 0 means the desktop helper is installed; the card hides. */
    captureCount: number;
    /** ISO timestamp of the user's first completed drill. Drives the cadence (every drill in the first 7 days, then weekly). */
    firstDrillCompletedAt?: string | null;
    /** ISO `createdAt` of the drill the user just finished, used to compare against the dismissal stamp. */
    drillCreatedAt?: string | null;
};

function readDismissedAt(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(DISMISSED_AT_KEY);
    } catch {
        return null;
    }
}

function writeDismissedAt(value: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(DISMISSED_AT_KEY, value);
    } catch {
        // localStorage may be disabled — silently no-op.
    }
}

function shouldRender(
    captureCount: number,
    firstDrillCompletedAt: string | null | undefined,
    drillCreatedAt: string | null | undefined,
    dismissedAt: string | null,
): boolean {
    // Hide once the desktop helper is installed.
    if (captureCount > 0) return false;

    const now = Date.now();
    const firstDrillMs = firstDrillCompletedAt
        ? Date.parse(firstDrillCompletedAt)
        : Number.NaN;
    const drillCreatedMs = drillCreatedAt
        ? Date.parse(drillCreatedAt)
        : Number.NaN;
    const dismissedMs = dismissedAt ? Date.parse(dismissedAt) : Number.NaN;

    const inFirstWeek =
        Number.isFinite(firstDrillMs) && now - firstDrillMs < SEVEN_DAYS_MS;

    if (inFirstWeek) {
        // Show on every drill until the user dismisses; once dismissed, hide
        // until the next drill (drillCreatedAt > dismissedAt).
        if (!Number.isFinite(dismissedMs)) return true;
        if (!Number.isFinite(drillCreatedMs)) return true;
        return drillCreatedMs > dismissedMs;
    }

    // After the first 7 days: weekly until installed.
    if (!Number.isFinite(dismissedMs)) return true;
    return now - dismissedMs > SEVEN_DAYS_MS;
}

export function PostDrillInstallCard({
    captureCount,
    firstDrillCompletedAt,
    drillCreatedAt,
}: Readonly<Props>) {
    const [hasMounted, setHasMounted] = useState(false);
    const [dismissedAt, setDismissedAt] = useState<string | null>(null);
    const [locallyDismissed, setLocallyDismissed] = useState(false);

    useEffect(() => {
        setDismissedAt(readDismissedAt());
        setHasMounted(true);
    }, []);

    if (!hasMounted) return null;
    if (locallyDismissed) return null;
    if (
        !shouldRender(
            captureCount,
            firstDrillCompletedAt,
            drillCreatedAt,
            dismissedAt,
        )
    ) {
        return null;
    }

    const handleDismiss = () => {
        const now = new Date().toISOString();
        writeDismissedAt(now);
        setDismissedAt(now);
        setLocallyDismissed(true);
    };

    return (
        <div className="relative rounded-2xl border border-sky-200/80 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss"
                className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md text-sky-700/70 hover:bg-sky-100/60 dark:text-sky-300/70 dark:hover:bg-sky-900/40"
            >
                <X className="size-4" />
            </button>
            <div className="flex items-start gap-3 pr-7">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-200/60 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    <Sparkles className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                        Sayzo learns from your real meetings, too
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Install the desktop companion to get drills tied to
                        your actual conversations and a quick reminder when
                        it&apos;s time to practice.
                    </p>
                    <Link
                        href="/install"
                        className="mt-3 inline-flex items-center justify-center rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                    >
                        Install the desktop companion
                    </Link>
                </div>
            </div>
        </div>
    );
}
