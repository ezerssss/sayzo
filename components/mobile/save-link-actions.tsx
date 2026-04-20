"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/utils";

const INSTALL_URL = "https://sayzo.app/install?utm_source=mobile_share";
const SHARE_TITLE = "Sayzo";
const SHARE_TEXT =
    "Install Sayzo on your computer to run drills built from your real meetings.";

type Layout = "stacked" | "inline";

type Props = {
    source: "banner" | "install_page";
    layout?: Layout;
};

export function SaveLinkActions({ source, layout = "stacked" }: Props) {
    const [shareSupported, setShareSupported] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // Client-only capability probe after hydration to avoid SSR mismatch.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShareSupported(
            typeof navigator !== "undefined" &&
                typeof navigator.share === "function",
        );
    }, []);

    const handleShare = async () => {
        try {
            await navigator.share({
                title: SHARE_TITLE,
                text: SHARE_TEXT,
                url: INSTALL_URL,
            });
            track("install_link_sent_to_self", { method: "share", source });
        } catch (err) {
            // User cancelled the native share sheet — silent.
            const name = (err as { name?: string })?.name;
            if (name === "AbortError") return;
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(INSTALL_URL);
            setCopied(true);
            track("install_link_sent_to_self", { method: "copy", source });
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked (older in-app browsers) — best effort only.
        }
    };

    const isStacked = layout === "stacked";
    const buttonSize = isStacked ? "lg" : "xs";
    const containerClass = isStacked
        ? "flex flex-col gap-2"
        : "flex shrink-0 items-center gap-1.5";
    const buttonClass = isStacked ? "w-full" : undefined;
    const shareLabel = isStacked ? "Share to myself" : "Share";
    const copyLabel = isStacked ? "Copy link" : "Copy";

    return (
        <div className={containerClass}>
            {shareSupported ? (
                <Button
                    onClick={() => void handleShare()}
                    size={buttonSize}
                    className={buttonClass}
                >
                    <Share2 />
                    {shareLabel}
                </Button>
            ) : null}
            <Button
                variant={shareSupported ? "outline" : "default"}
                onClick={() => void handleCopy()}
                size={buttonSize}
                className={cn(buttonClass)}
            >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : copyLabel}
            </Button>
        </div>
    );
}
