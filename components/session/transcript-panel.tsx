"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface PropsInterface {
    transcript: string;
    onSeekToSecond?: (seconds: number) => void;
    /** Defaults to "Transcript" (drill response). Use for skip reasons etc. */
    heading?: string;
    /** Start collapsed. Defaults to true. */
    defaultCollapsed?: boolean;
}

export function TranscriptPanel(props: Readonly<PropsInterface>) {
    const {
        transcript,
        onSeekToSecond,
        heading = "Transcript",
        defaultCollapsed = true,
    } = props;
    const [isOpen, setIsOpen] = useState(!defaultCollapsed);

    const lines = transcript.split("\n");

    const parseTimestamp = (value: string): number | null => {
        const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!m) return null;
        if (m[3] != null) {
            const hh = Number(m[1]);
            const mm = Number(m[2]);
            const ss = Number(m[3]);
            return hh * 3600 + mm * 60 + ss;
        }
        const mm = Number(m[1]);
        const ss = Number(m[2]);
        return mm * 60 + ss;
    };

    return (
        <div className="rounded-xl border border-border/70">
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between p-4"
            >
                <span className="text-sm font-medium">{heading}</span>
                <ChevronDown
                    className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
            {isOpen ? (
                <div className="space-y-1 border-t border-border/50 px-4 pb-4 pt-3 text-sm text-muted-foreground">
                    {lines.map((line, idx) => {
                        const match = line.match(
                            /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/,
                        );
                        if (!match) {
                            return <p key={`${idx}-${line}`}>{line}</p>;
                        }
                        const stamp = match[1] ?? "";
                        const seconds = parseTimestamp(stamp);
                        if (seconds == null || !onSeekToSecond) {
                            return <p key={`${idx}-${line}`}>{line}</p>;
                        }
                        return (
                            <p key={`${idx}-${line}`}>
                                <button
                                    type="button"
                                    className="mr-1 rounded-md bg-muted px-1.5 py-0.5 text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80"
                                    onClick={() => onSeekToSecond(seconds)}
                                >
                                    [{stamp}]
                                </button>
                                {line.replace(match[0], "").trim()}
                            </p>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

