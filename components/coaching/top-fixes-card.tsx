"use client";

import { ChevronDown, Play, Wrench } from "lucide-react";
import { useState } from "react";

import { InlineMarkdown } from "@/components/session/inline-markdown";
import { cn } from "@/lib/utils";
import type { TeachableMoment } from "@/schemas";

type Props = {
    moments: TeachableMoment[];
    /** Optional seek-to-timestamp callback. When omitted, the chip becomes a passive label. */
    onSeek?: (seconds: number) => void;
    /** Hard cap on how many moments to render. Defaults to 2 — Sayzo's bite-sized constraint. */
    max?: number;
};

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

// Card-less: a plain collapsible header + a divided list of numbered fixes — no
// outer box. The actionable "Try instead" rewrite is a sky left-accent, the
// neutral anchor a quiet left-accent quote.
export function TopFixesCard({ moments, onSeek, max = 2 }: Readonly<Props>) {
    const [isOpen, setIsOpen] = useState(true);
    const items = moments.slice(0, max);
    if (items.length === 0) return null;

    return (
        <div data-tour="fix-these-first">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="flex w-full items-center gap-2"
            >
                <Wrench className="size-4 text-foreground/70" />
                <h3 className="text-sm font-semibold tracking-tight">
                    Fix these first
                </h3>
                <span className="ml-auto font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {items.length === 1
                        ? "1 priority"
                        : `${items.length} priorities`}
                </span>
                <ChevronDown
                    className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
            {isOpen ? (
                <ol className="mt-3 divide-y divide-border/50">
                    {items.map((moment, index) => (
                        <li
                            key={`${moment.timestamp}-${moment.transcriptIdx}-${index}`}
                            className="space-y-3 py-4 first:pt-0"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-medium text-white">
                                    {index + 1}
                                </span>
                                {Number.isFinite(moment.timestamp) &&
                                moment.timestamp >= 0 ? (
                                    onSeek ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onSeek(moment.timestamp)
                                            }
                                            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted/80"
                                            title={`Seek to ${formatTimestamp(moment.timestamp)}`}
                                        >
                                            <Play className="size-3" />
                                            {formatTimestamp(moment.timestamp)}
                                        </button>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                                            {formatTimestamp(moment.timestamp)}
                                        </span>
                                    )
                                ) : null}
                            </div>
                            <blockquote className="border-l-2 border-border/70 pl-3 text-sm leading-relaxed text-foreground/90">
                                {moment.anchor}
                            </blockquote>
                            {moment.betterOption ? (
                                <div className="border-l-2 border-sky-300 pl-3">
                                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sky-700/80">
                                        Try instead
                                    </p>
                                    <div className="mt-1">
                                        <InlineMarkdown
                                            text={moment.betterOption}
                                            tone="body"
                                        />
                                    </div>
                                </div>
                            ) : null}
                            {moment.whyThisMatters ? (
                                <div>
                                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                        Why this matters
                                    </p>
                                    <div className="mt-1">
                                        <InlineMarkdown
                                            text={moment.whyThisMatters}
                                            tone="small-muted"
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ol>
            ) : null}
        </div>
    );
}
