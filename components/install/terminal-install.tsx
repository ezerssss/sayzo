"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";

import { type OS, PLATFORMS } from "./platforms";

/**
 * The tucked-away terminal one-liner for power users. Render with
 * `key={os}` so the copied state resets when the platform switches.
 */
export function TerminalInstall({ os }: Readonly<{ os: OS }>) {
    const [copied, setCopied] = useState(false);
    const active = PLATFORMS[os];

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(active.command);
            setCopied(true);
            track("install_terminal_copied", { os });
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked — user can copy manually
        }
    };

    return (
        <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                <Terminal className="size-3" />
                <span className="group-open:hidden">Prefer the terminal?</span>
                <span className="hidden group-open:inline">
                    Hide terminal one-liner
                </span>
            </summary>
            <div className="mt-3">
                <p className="mb-2 text-xs font-medium tracking-widest text-muted-foreground uppercase">
                    {active.shell}
                </p>
                <div className="flex items-stretch gap-2">
                    <code className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                        {active.command}
                    </code>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCopy()}
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
    );
}
