"use client";

import Link from "next/link";
import {
    Apple,
    ArrowRight,
    Check,
    Copy,
    Download,
    Monitor,
    Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import type { InstallPanelSource } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

const DOWNLOAD_TIMESTAMP_KEY = "sayzo.desktop.downloadedAt";

export type OS = "windows" | "macos";

// Bump when publishing a new agent release — download filenames are built from this.
export const AGENT_VERSION = "0.1.0";

type PlatformCopy = {
    label: string;
    shell: string;
    command: string;
    downloadUrl: string;
    fileName: string;
    minOS: string;
};

export const PLATFORMS: Record<OS, PlatformCopy> = {
    windows: {
        label: "Windows",
        shell: "PowerShell",
        command: "irm https://sayzo.app/releases/windows/install.ps1 | iex",
        downloadUrl: `https://sayzo.app/releases/windows/sayzo-agent-setup-${AGENT_VERSION}.exe`,
        fileName: `sayzo-agent-setup-${AGENT_VERSION}.exe`,
        minOS: "Windows 10 or newer",
    },
    macos: {
        label: "macOS",
        shell: "Terminal",
        command: "curl -fsSL https://sayzo.app/releases/macos/install.sh | bash",
        downloadUrl: `https://sayzo.app/releases/macos/Sayzo-Agent-${AGENT_VERSION}.dmg`,
        fileName: `Sayzo-Agent-${AGENT_VERSION}.dmg`,
        minOS: "macOS 14.4 or newer",
    },
};

export function detectOS(): OS {
    if (typeof navigator === "undefined") return "windows";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad")) {
        return "macos";
    }
    return "windows";
}

export function otherOS(os: OS): OS {
    return os === "windows" ? "macos" : "windows";
}

type Props = {
    showViewAllLink?: boolean;
    headline?: string;
    subhead?: string;
    // When provided, OS is controlled by the parent (share state with siblings like InstallSteps).
    os?: OS;
    onOSChange?: (os: OS) => void;
    // Where this panel is embedded — used to attribute download clicks in analytics.
    analyticsSource?: InstallPanelSource;
};

export function InstallPanel(props: Readonly<Props>) {
    const {
        showViewAllLink,
        headline = "Install the Sayzo desktop companion",
        subhead = "Download, double-click, done. Sayzo runs locally and feeds your coaching loop the moments worth working on.",
        os: controlledOS,
        onOSChange,
        analyticsSource = "landing_panel",
    } = props;
    const isControlled = controlledOS !== undefined;
    const [internalOS, setInternalOS] = useState<OS>("windows");
    const [copied, setCopied] = useState(false);

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

    const handleCopy = async (command: string) => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            track("install_terminal_copied", { os });
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked — user can copy manually
        }
    };

    const switchOS = () => {
        const next = otherOS(os);
        track("install_os_switched", { from: os, to: next });
        setOS(next);
        setCopied(false);
    };

    const handleDownloadClick = () => {
        track("desktop_download_clicked", {
            os,
            agent_version: AGENT_VERSION,
            source: analyticsSource,
        });
        try {
            window.localStorage.setItem(
                DOWNLOAD_TIMESTAMP_KEY,
                String(Date.now()),
            );
        } catch {
            // localStorage may be unavailable (private mode) — best effort only.
        }
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

            <div className="mt-4">
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200/70">
                    <OSIcon className="size-3" />
                    Detected {active.label}
                </div>

                <a
                    href={active.downloadUrl}
                    download
                    onClick={handleDownloadClick}
                    className={cn(buttonVariants({ size: "lg" }), "w-full")}
                >
                    <Download className="size-4" />
                    Download for {active.label}
                </a>
                <p className="mt-2 text-xs text-muted-foreground">
                    {active.fileName} · {active.minOS}
                </p>

                <button
                    type="button"
                    onClick={switchOS}
                    className="mt-3 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                    Need {other.label} instead?
                </button>
            </div>

            <details className="group mt-4 border-t border-border/50 pt-3">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <Terminal className="size-3" />
                    <span className="group-open:hidden">
                        Prefer the terminal?
                    </span>
                    <span className="hidden group-open:inline">
                        Hide terminal one-liner
                    </span>
                </summary>
                <div className="mt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        {active.shell}
                    </p>
                    <div className="flex items-stretch gap-2">
                        <code className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                            {active.command}
                        </code>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleCopy(active.command)}
                            aria-label={`Copy ${active.shell} command`}
                        >
                            {copied ? (
                                <Check className="size-3.5" />
                            ) : (
                                <Copy className="size-3.5" />
                            )}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    </div>
                </div>
            </details>

            {showViewAllLink ? (
                <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                    <Link
                        href="/install"
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                        Open install page
                        <ArrowRight className="size-3" />
                    </Link>
                </div>
            ) : null}
        </div>
    );
}
