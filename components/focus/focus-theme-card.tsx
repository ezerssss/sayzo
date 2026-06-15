"use client";

import Link from "next/link";
import {
    ChevronDown,
    ChevronUp,
    Minus,
    Plus,
    TrendingDown,
    TrendingUp,
    type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Kicker } from "@/components/coaching/briefing";
import { cn } from "@/lib/utils";
import type { FocusEvidence, FocusTheme, FocusThemeTrend } from "@/schemas";

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
        return `/app/replays/${evidence.sourceId}`;
    }
    return `/app/conversations/${evidence.sourceId}`;
}

// Trend is a small colored text+icon signal, not a filled pill — four filled
// pills down the list were their own noise. Hues stay semantic (improving =
// emerald, regressing = rose, new = amber, consistent = slate).
const TREND_STYLES: Record<
    FocusThemeTrend,
    { label: string; color: string; Icon: LucideIcon }
> = {
    new: { label: "New", color: "text-amber-600", Icon: Plus },
    regressing: {
        label: "Regressing",
        color: "text-rose-600",
        Icon: TrendingDown,
    },
    stable: { label: "Consistent", color: "text-slate-500", Icon: Minus },
    improving: {
        label: "Improving",
        color: "text-emerald-600",
        Icon: TrendingUp,
    },
};

/**
 * One focus theme, deliberately lean: the pattern (title) + a quiet trend, and
 * the fix (nudge) — that's all that shows by default. The "why it's costing
 * you" and the supporting moments live behind a single toggle, so the focus
 * page reads as a scannable pattern→fix list instead of a wall of text.
 */
export function FocusThemeCard({ theme }: { theme: FocusTheme }) {
    const [expanded, setExpanded] = useState(false);
    const trend = TREND_STYLES[theme.trend];
    const TrendIcon = trend.Icon;
    const hasEvidence = theme.evidence.length > 0;
    const momentsLabel = `${theme.evidence.length} moment${
        theme.evidence.length === 1 ? "" : "s"
    }`;

    return (
        <div className="py-6 first:pt-0">
            <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    {theme.title}
                </h3>
                <span
                    className={cn(
                        "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
                        trend.color,
                    )}
                >
                    <TrendIcon className="size-3.5" />
                    {trend.label}
                </span>
            </div>

            {/* The fix — the value of the page, always visible. */}
            <div className="mt-3 border-l-2 border-sky-300 pl-3.5">
                <Kicker>Try next time</Kicker>
                <p className="mt-1 text-sm text-foreground">{theme.nudge}</p>
            </div>

            {/* One toggle for the why + the proof, so the default stays lean. */}
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
                {expanded ? (
                    <ChevronUp className="size-3.5" />
                ) : (
                    <ChevronDown className="size-3.5" />
                )}
                {expanded
                    ? "Hide details"
                    : hasEvidence
                      ? `Why this matters · ${momentsLabel}`
                      : "Why this matters"}
            </button>

            {expanded ? (
                <div className="mt-3 space-y-3">
                    <p className="text-sm text-muted-foreground">
                        {theme.cost}
                    </p>
                    {hasEvidence ? (
                        <ul className="space-y-3 border-l-2 border-border/60 pl-4">
                            {theme.evidence.map((evidence, idx) => (
                                <li
                                    key={`${evidence.source}-${evidence.sourceId}-${idx}`}
                                >
                                    <Link
                                        href={evidenceHref(evidence)}
                                        className="group/item block space-y-1"
                                    >
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                                {evidence.source === "session"
                                                    ? "Replay"
                                                    : "Conversation"}
                                            </span>
                                            <span className="truncate font-medium text-foreground/70 group-hover/item:text-foreground">
                                                {evidence.sourceTitle}
                                            </span>
                                            <span className="shrink-0">·</span>
                                            <span className="shrink-0">
                                                {formatRelativeDate(
                                                    evidence.createdAt,
                                                )}
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
            ) : null}
        </div>
    );
}
