"use client";

import { Download } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import type { InstallPanelSource } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

import { DOWNLOAD_TIMESTAMP_KEY, type OS, PLATFORMS } from "./platforms";

type Props = {
    os: OS;
    analyticsSource: InstallPanelSource;
    onDownloaded?: () => void;
    buttonClassName?: string;
};

/**
 * The download button plus its filename/min-OS line. Single home for the
 * download click side effects (analytics + the timestamp the dashboard uses
 * to measure download-to-first-capture).
 */
export function DownloadCta({
    os,
    analyticsSource,
    onDownloaded,
    buttonClassName,
}: Readonly<Props>) {
    const active = PLATFORMS[os];

    const handleClick = () => {
        track("desktop_download_clicked", {
            os,
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
        onDownloaded?.();
    };

    return (
        <div>
            <a
                href={active.downloadUrl}
                download
                onClick={handleClick}
                className={cn(buttonVariants({ size: "lg" }), buttonClassName)}
            >
                <Download className="size-4" />
                Download for {active.label}
            </a>
            <p className="mt-2 text-xs text-muted-foreground">
                {active.fileName} · {active.minOS}
            </p>
        </div>
    );
}
