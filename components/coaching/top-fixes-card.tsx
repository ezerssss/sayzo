"use client";

import { Play, Wrench } from "lucide-react";

import { InlineMarkdown } from "@/components/session/inline-markdown";
import type { TeachableMoment } from "@/types/captures";

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

export function TopFixesCard({ moments, onSeek, max = 2 }: Readonly<Props>) {
    const items = moments.slice(0, max);
    if (items.length === 0) return null;

    return (
        <div className="rounded-2xl border border-border/70 bg-background">
            <div className="flex items-center gap-2 border-b border-border/50 p-4">
                <Wrench className="size-4 text-foreground/70" />
                <h3 className="text-sm font-semibold tracking-tight">
                    Fix these first
                </h3>
                <span className="ml-auto text-xs text-muted-foreground">
                    {items.length === 1 ? "1 priority" : `${items.length} priorities`}
                </span>
            </div>
            <ol className="divide-y divide-border/50">
                {items.map((moment, index) => (
                    <li
                        key={`${moment.timestamp}-${moment.transcriptIdx}-${index}`}
                        className="space-y-3 p-4"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-medium text-white">
                                {index + 1}
                            </span>
                            {Number.isFinite(moment.timestamp) && moment.timestamp > 0 ? (
                                onSeek ? (
                                    <button
                                        type="button"
                                        onClick={() => onSeek(moment.timestamp)}
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
                            <div className="rounded-lg bg-muted/50 p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
        </div>
    );
}
