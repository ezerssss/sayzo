"use client";

import Link from "next/link";
import { Apple, ArrowRight, Check, Copy, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OS = "windows" | "macos";

const COMMANDS: Record<OS, { label: string; shell: string; command: string }> = {
    windows: {
        label: "Windows",
        shell: "PowerShell",
        command: "irm https://sayzo.app/releases/windows/install.ps1 | iex",
    },
    macos: {
        label: "macOS",
        shell: "Terminal",
        command: "curl -fsSL https://sayzo.app/releases/macos/install.sh | bash",
    },
};

function detectOS(): OS {
    if (typeof navigator === "undefined") return "windows";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad")) {
        return "macos";
    }
    return "windows";
}

type Props = {
    onDismiss?: () => void;
    showViewAllLink?: boolean;
    headline?: string;
    subhead?: string;
};

export function InstallPanel(props: Readonly<Props>) {
    const {
        onDismiss,
        showViewAllLink,
        headline = "Install the Sayzo desktop companion",
        subhead = "One terminal command. The companion runs locally and feeds your coaching loop the moments worth working on.",
    } = props;
    const [os, setOS] = useState<OS>("windows");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setOS(detectOS());
    }, []);

    const handleCopy = async (command: string) => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked — user can copy manually
        }
    };

    return (
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-5">
            <div>
                <h3 className="text-sm font-semibold tracking-tight">
                    {headline}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{subhead}</p>
            </div>

            <Tabs
                value={os}
                onValueChange={(v) => {
                    setOS(v as OS);
                    setCopied(false);
                }}
                className="mt-4"
            >
                <TabsList>
                    <TabsTrigger value="windows">
                        <Monitor className="size-3.5" />
                        Windows
                    </TabsTrigger>
                    <TabsTrigger value="macos">
                        <Apple className="size-3.5" />
                        macOS
                    </TabsTrigger>
                </TabsList>

                {(Object.keys(COMMANDS) as OS[]).map((key) => {
                    const { shell, command } = COMMANDS[key];
                    return (
                        <TabsContent key={key} value={key} className="mt-3">
                            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                                {shell}
                            </p>
                            <div className="flex items-stretch gap-2">
                                <code className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                                    {command}
                                </code>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleCopy(command)}
                                    aria-label={`Copy ${shell} command`}
                                >
                                    {copied ? (
                                        <Check className="size-3.5" />
                                    ) : (
                                        <Copy className="size-3.5" />
                                    )}
                                    {copied ? "Copied" : "Copy"}
                                </Button>
                            </div>
                        </TabsContent>
                    );
                })}
            </Tabs>

            {(onDismiss || showViewAllLink) && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    {onDismiss ? (
                        <button
                            type="button"
                            className="hover:text-foreground transition-colors"
                            onClick={onDismiss}
                        >
                            I&apos;ll do it later
                        </button>
                    ) : (
                        <span />
                    )}
                    {showViewAllLink ? (
                        <Link
                            href="/install"
                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                            Open install page
                            <ArrowRight className="size-3" />
                        </Link>
                    ) : null}
                </div>
            )}
        </div>
    );
}
