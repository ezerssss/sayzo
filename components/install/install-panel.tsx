"use client";

import Link from "next/link";
import {
    Apple,
    ArrowRight,
    Monitor,
    ShieldCheck,
    Smartphone,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SaveLinkActions } from "@/components/mobile/save-link-actions";
import { track } from "@/lib/analytics/client";
import type { InstallPanelSource } from "@/lib/analytics/events";
import { useIsMobile } from "@/lib/device/is-mobile";

import { DownloadCta } from "./download-cta";
import { detectOS, type OS, otherOS, PLATFORMS } from "./platforms";
import { TerminalInstall } from "./terminal-install";

// Platform constants/utilities moved to ./platforms — re-exported here so
// existing imports (e.g. sessions-dashboard) keep working unchanged.
export { detectOS, type OS, otherOS, PLATFORMS } from "./platforms";

type Props = {
    showViewAllLink?: boolean;
    headline?: string;
    subhead?: string;
    // When provided, OS is controlled by the parent (share state with siblings like InstallSteps).
    os?: OS;
    onOSChange?: (os: OS) => void;
    // Where this panel is embedded — used to attribute download clicks in analytics.
    analyticsSource?: InstallPanelSource;
    // Where the "Windows shows a caution screen" note links to. A "#" href
    // scrolls in-page (the install page); anything else opens in a new tab.
    // Pass null to hide the note. Defaults on so every embed forewarns
    // Windows users about the caution screen.
    windowsCautionHref?: string | null;
};

export function InstallPanel(props: Readonly<Props>) {
    const {
        showViewAllLink,
        headline = "Install the Sayzo desktop companion",
        subhead = "Download, double-click, done. Sayzo runs locally and feeds your coaching loop the moments worth working on.",
        os: controlledOS,
        onOSChange,
        analyticsSource = "landing_panel",
        windowsCautionHref = "/install#windows-caution",
    } = props;
    const isControlled = controlledOS !== undefined;
    const [internalOS, setInternalOS] = useState<OS>("windows");
    const isMobile = useIsMobile();
    const mobileDetectedRef = useRef(false);

    const os = isControlled ? controlledOS : internalOS;
    const setOS = (next: OS) => {
        if (onOSChange) onOSChange(next);
        if (!isControlled) setInternalOS(next);
    };

    useEffect(() => {
        if (isControlled) return;
        // Client-only UA detection after hydration; SSR must render the default to match.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInternalOS(detectOS());
    }, [isControlled]);

    useEffect(() => {
        if (!isMobile || mobileDetectedRef.current) return;
        mobileDetectedRef.current = true;
        track("mobile_visitor_detected", { page: "install_page" });
    }, [isMobile]);

    const switchOS = () => {
        const next = otherOS(os);
        track("install_os_switched", { from: os, to: next });
        setOS(next);
    };

    const active = PLATFORMS[os];
    const other = PLATFORMS[otherOS(os)];
    const OSIcon = os === "macos" ? Apple : Monitor;

    return (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div>
                <h3 className="text-sm font-semibold tracking-tight">
                    {headline}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{subhead}</p>
            </div>

            {isMobile ? (
                <div className="mt-4 flex flex-col gap-3">
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200/70">
                        <Smartphone className="size-3" />
                        You&apos;re on mobile — save for your computer
                    </div>
                    <SaveLinkActions source="install_page" layout="stacked" />
                    <p className="text-xs text-muted-foreground">
                        Sayzo runs on Windows and macOS. Send yourself the link
                        and finish the install on your computer.
                    </p>
                </div>
            ) : (
                <>
                    <div className="mt-4">
                        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200/70">
                            <OSIcon className="size-3" />
                            Detected {active.label}
                        </div>

                        <DownloadCta
                            os={os}
                            analyticsSource={analyticsSource}
                            buttonClassName="w-full"
                        />

                        {os === "windows" && windowsCautionHref ? (
                            <div className="mt-3 flex items-start gap-2 rounded-lg bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900/60">
                                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                                <span>
                                    Windows will show a caution screen before
                                    installing — that&apos;s expected.{" "}
                                    {windowsCautionHref.startsWith("#") ? (
                                        <>
                                            The steps below show every click,
                                            and you can read{" "}
                                            <a
                                                href={windowsCautionHref}
                                                onClick={() =>
                                                    track(
                                                        "install_caution_link_clicked",
                                                        {
                                                            source: analyticsSource,
                                                        },
                                                    )
                                                }
                                                className="font-medium underline underline-offset-4 hover:text-sky-700 dark:hover:text-sky-100"
                                            >
                                                why it happens
                                            </a>
                                            .
                                        </>
                                    ) : (
                                        <a
                                            href={windowsCautionHref}
                                            target="_blank"
                                            rel="noopener"
                                            onClick={() =>
                                                track(
                                                    "install_caution_link_clicked",
                                                    {
                                                        source: analyticsSource,
                                                    },
                                                )
                                            }
                                            className="font-medium underline underline-offset-4 hover:text-sky-700 dark:hover:text-sky-100"
                                        >
                                            See exactly what to click.
                                        </a>
                                    )}
                                </span>
                            </div>
                        ) : null}

                        <button
                            type="button"
                            onClick={switchOS}
                            className="mt-3 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                        >
                            Need {other.label} instead?
                        </button>
                    </div>

                    <div className="mt-4 border-t border-border/50 pt-3">
                        <TerminalInstall key={os} os={os} />
                    </div>
                </>
            )}

            {showViewAllLink ? (
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                    <Link
                        href="/install"
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                        Open install page
                        <ArrowRight className="size-3" />
                    </Link>
                </div>
            ) : null}
        </div>
    );
}
