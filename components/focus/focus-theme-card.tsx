"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type {
    FocusEvidence,
    FocusTheme,
    FocusThemeTrend,
} from "@/types/focus-insights";

function formatRelativeDate(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    } catch {
        return iso;
    }
}

function evidenceHref(evidence: FocusEvidence): string {
    if (evidence.source === "session") {
        return `/app/drills/${evidence.sourceId}`;
    }
    return `/app/conversations/${evidence.sourceId}`;
}

const TREND_STYLES: Record<
    FocusThemeTrend,
    { label: string; className: string }
> = {
    new: {
        label: "New",
        className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/70",
    },
    regressing: {
        label: "Regressing",
        className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/70",
    },
    stable: {
        label: "Consistent",
        className: "bg-slate-50 text-slate-600 ring-1 ring-slate-200/70",
    },
    improving: {
        label: "Improving",
        className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70",
    },
};

export function FocusThemeCard({ theme }: { theme: FocusTheme }) {
    const [expanded, setExpanded] = useState(false);
    const trend = TREND_STYLES[theme.trend];
    const hasEvidence = theme.evidence.length > 0;

    return (
        <div className="group rounded-2xl border border-border/60 bg-card/60 p-5 transition-colors hover:border-border">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    {theme.title}
                </h3>
                <div className="flex shrink-0 items-center gap-1.5">
                    <span
                        className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                            trend.className,
                        )}
                    >
                        {trend.label}
                    </span>
                    {theme.isEmergent ? (
                        <span
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200/70"
                            title="A pattern we noticed specifically in your sessions"
                        >
                            <Sparkles className="h-3 w-3" />
                            Specific to you
                        </span>
                    ) : null}
                </div>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">{theme.cost}</p>

            <div className="mt-4 rounded-lg bg-muted/40 px-3.5 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Try next time
                </p>
                <p className="mt-1 text-sm text-foreground">{theme.nudge}</p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                    {theme.frequencySummary}
                </span>
                {hasEvidence ? (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {expanded ? "Hide moments" : `Show ${theme.evidence.length} moment${theme.evidence.length === 1 ? "" : "s"}`}
                    </button>
                ) : null}
            </div>

            {hasEvidence && expanded ? (
                <ul className="mt-3 space-y-3 border-l-2 border-border/60 pl-4">
                    {theme.evidence.map((evidence, idx) => (
                        <li key={`${evidence.source}-${evidence.sourceId}-${idx}`}>
                            <Link
                                href={evidenceHref(evidence)}
                                className="group/item block space-y-1"
                            >
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                        {evidence.source === "session" ? "Drill" : "Capture"}
                                    </span>
                                    <span className="truncate font-medium text-foreground/70 group-hover/item:text-foreground">
                                        {evidence.sourceTitle}
                                    </span>
                                    <span className="shrink-0">·</span>
                                    <span className="shrink-0">
                                        {formatRelativeDate(evidence.createdAt)}
                                    </span>
                                </div>
                                {evidence.quote ? (
                                    <p className="text-sm italic text-foreground/80">
                                        &ldquo;{evidence.quote}&rdquo;
                                    </p>
                                ) : null}
                                {evidence.note ? (
                                    <p className="text-xs text-muted-foreground">
                                        {evidence.note}
                                    </p>
                                ) : null}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
