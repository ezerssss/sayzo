"use client";

import { Apple, BadgeCheck, Monitor } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { track } from "@/lib/analytics/client";
import { useIsMobile } from "@/lib/device/is-mobile";

import { InstallFaq } from "./install-faq";
import {
    InstallSteps,
    installStepCount,
    installStepDomId,
} from "./install-steps";
import { detectOS, type OS, otherOS, PLATFORMS } from "./platforms";
import { TerminalInstall } from "./terminal-install";
import { WindowsCautionSection } from "./windows-caution-section";

/**
 * The /install page's guide: one continuous step rail with the download
 * button as step 1. Renders full-width so the trust section can be a
 * full-bleed band; each section constrains its own content width.
 */
export function InstallFlow() {
    const [os, setOS] = useState<OS>("windows");
    const [downloaded, setDownloaded] = useState(false);
    const [highlightId, setHighlightId] = useState<string | null>(null);
    const isMobile = useIsMobile();
    const mobileDetectedRef = useRef(false);
    const highlightTimerRef = useRef<number | null>(null);

    useEffect(() => {
        // Client-only UA detection after hydration; SSR must render the default to match.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOS(detectOS());
    }, []);

    useEffect(() => {
        if (!isMobile || mobileDetectedRef.current) return;
        mobileDetectedRef.current = true;
        track("mobile_visitor_detected", { page: "install_page" });
    }, [isMobile]);

    useEffect(
        () => () => {
            if (highlightTimerRef.current !== null) {
                window.clearTimeout(highlightTimerRef.current);
            }
        },
        [],
    );

    // The download takes a few seconds — use that idle moment to walk the
    // user to the step they most need to see before the installer runs.
    const handleDownloaded = () => {
        setDownloaded(true);
        const targetId = installStepDomId(
            os === "windows" ? "smartscreen" : "drag",
        );
        requestAnimationFrame(() => {
            const el = document.getElementById(targetId);
            if (!el) return;
            const reduceMotion = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches;
            el.scrollIntoView({
                behavior: reduceMotion ? "auto" : "smooth",
                block: "center",
            });
            setHighlightId(targetId);
            if (highlightTimerRef.current !== null) {
                window.clearTimeout(highlightTimerRef.current);
            }
            highlightTimerRef.current = window.setTimeout(
                () => setHighlightId(null),
                3200,
            );
        });
    };

    const switchOS = () => {
        const next = otherOS(os);
        track("install_os_switched", { from: os, to: next });
        setOS(next);
        setDownloaded(false);
        setHighlightId(null);
    };

    const active = PLATFORMS[os];
    const other = PLATFORMS[otherOS(os)];
    const OSIcon = os === "macos" ? Apple : Monitor;

    return (
        <div>
            <section className="mx-auto w-full max-w-4xl px-6 pb-16">
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                                How to install on {active.label}
                            </h2>
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[0.65rem] font-medium tracking-widest text-sky-700 uppercase ring-1 ring-sky-200/70">
                                <OSIcon className="size-2.5" />
                                Detected
                            </span>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                            {installStepCount(os)} quick steps, about two
                            minutes — we show you each screen before you see it.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={switchOS}
                        className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                        Need {other.label} instead?
                    </button>
                </div>

                <InstallSteps
                    os={os}
                    isMobile={isMobile}
                    downloaded={downloaded}
                    onDownloaded={handleDownloaded}
                    highlightId={highlightId}
                />

                {!isMobile ? (
                    <div className="mt-12 border-t border-border/50 pt-4">
                        <TerminalInstall key={os} os={os} />
                    </div>
                ) : null}
            </section>

            {os === "windows" ? (
                <WindowsCautionSection />
            ) : (
                <section className="border-y border-border/70 bg-muted/30">
                    <div className="mx-auto flex w-full max-w-4xl items-center gap-2.5 px-6 py-6 text-sm text-muted-foreground">
                        <BadgeCheck className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        Sayzo for Mac is verified by Apple — no warnings, it
                        just opens.
                    </div>
                </section>
            )}

            <section className="mx-auto w-full max-w-4xl px-6 py-14">
                <InstallFaq os={os} />
            </section>
        </div>
    );
}
