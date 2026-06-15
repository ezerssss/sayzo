"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCcw, Target } from "lucide-react";
import { useState } from "react";

import { Eyebrow } from "@/components/app/eyebrow";
import { HeroPanel } from "@/components/app/hero-panel";
import { StaggerItem } from "@/components/coaching/briefing";
import { Button } from "@/components/ui/button";
import { useFocusInsights } from "@/hooks/use-focus-insights";
import { cn } from "@/lib/utils";

import { FocusThemeCard } from "./focus-theme-card";

function formatRelativeTime(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        const diffMs = Date.now() - d.getTime();
        const minutes = Math.round(diffMs / 60_000);
        if (minutes < 1) return "just now";
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.round(hours / 24);
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    } catch {
        return iso;
    }
}

/**
 * The /app/focus screen — built on the same shell language as the overview and
 * conversation pages: an Eyebrow + text-2xl header, a staggered one-time
 * entrance, and exactly ONE HeroPanel (the big picture) so the gradient earns
 * its attention. Everything else is card-LESS: themes + wins read as a divided
 * briefing list (no boxes), and the first-run / insufficient / loading states
 * are left-aligned prose matching CapturesEmptyState. Pure presentation — the
 * data shape and useFocusInsights hook are unchanged.
 */
export function FocusDashboard({ uid }: { uid: string | undefined }) {
    const { insights, loading, refreshing, error, refresh } =
        useFocusInsights(uid);

    const hasInsights = insights !== null;
    const isEmpty = insights?.insufficientData === true;
    const themes = insights?.themes ?? [];
    const wins = insights?.wins ?? [];
    const [showAllThemes, setShowAllThemes] = useState(false);
    const [bigPictureOpen, setBigPictureOpen] = useState(false);

    return (
        <div className="space-y-8">
            <StaggerItem order={0}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <Eyebrow>Focus</Eyebrow>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                            Where to put your attention
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            The patterns costing you the most, and what&apos;s
                            already improving.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refresh()}
                        disabled={refreshing || !uid}
                        title="Rebuild from your latest conversations and replays"
                    >
                        {refreshing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCcw className="h-3.5 w-3.5" />
                        )}
                        Refresh
                    </Button>
                </div>
            </StaggerItem>

            {error ? (
                <p className="text-sm text-destructive" role="alert">
                    {error}
                </p>
            ) : null}

            {loading && !hasInsights ? (
                <LoadingSkeleton />
            ) : !hasInsights ? (
                <FirstRunState refreshing={refreshing} />
            ) : isEmpty ? (
                <InsufficientDataState />
            ) : (
                <>
                    {/* The one gradient panel on the page (shared HeroPanel) —
                        a plain-language read on where things stand. */}
                    {insights?.overview?.trim() ? (
                        <StaggerItem order={1}>
                            <HeroPanel>
                                <Eyebrow tone="sky">The big picture</Eyebrow>
                                <div className="mt-2 flex items-start gap-3">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-200/60 text-sky-700">
                                        <Target className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                "max-w-3xl text-sm leading-relaxed text-foreground/90",
                                                !bigPictureOpen &&
                                                    "line-clamp-2",
                                            )}
                                        >
                                            {insights.overview}
                                        </p>
                                        {insights.overview.length > 160 ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setBigPictureOpen((v) => !v)
                                                }
                                                className="mt-1 text-xs font-medium text-sky-700 transition-colors hover:text-sky-800"
                                            >
                                                {bigPictureOpen
                                                    ? "Show less"
                                                    : "Read more"}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </HeroPanel>
                        </StaggerItem>
                    ) : null}

                    {themes.length > 0 ? (
                        <StaggerItem order={2} className="space-y-3">
                            <Eyebrow tone="muted">What to work on</Eyebrow>
                            <div className="divide-y divide-border/50">
                                {(showAllThemes
                                    ? themes
                                    : themes.slice(0, 3)
                                ).map((theme) => (
                                    <FocusThemeCard
                                        key={theme.id}
                                        theme={theme}
                                    />
                                ))}
                            </div>
                            {themes.length > 3 ? (
                                <button
                                    type="button"
                                    onClick={() => setShowAllThemes((v) => !v)}
                                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    {showAllThemes
                                        ? "Show less"
                                        : `Show ${themes.length - 3} more`}
                                </button>
                            ) : null}
                        </StaggerItem>
                    ) : null}

                    {wins.length > 0 ? (
                        <StaggerItem order={3} className="space-y-3">
                            <Eyebrow tone="muted">
                                What&apos;s changing ({wins.length})
                            </Eyebrow>
                            <ul className="divide-y divide-border/50">
                                {wins.map((win, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-start gap-3 py-4 first:pt-0"
                                    >
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                            <CheckCircle2 className="size-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-foreground/90">
                                                {win.statement}
                                            </p>
                                            {win.lastSeen ? (
                                                <Link
                                                    href={
                                                        win.lastSeen.source ===
                                                        "session"
                                                            ? `/app/replays/${win.lastSeen.sourceId}`
                                                            : `/app/conversations/${win.lastSeen.sourceId}`
                                                    }
                                                    className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                >
                                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                                        {win.lastSeen.source ===
                                                        "session"
                                                            ? "Replay"
                                                            : "Conversation"}
                                                    </span>
                                                    <span className="truncate">
                                                        Last seen in &ldquo;
                                                        {
                                                            win.lastSeen
                                                                .sourceTitle
                                                        }
                                                        &rdquo;
                                                    </span>
                                                </Link>
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </StaggerItem>
                    ) : null}

                    {insights ? (
                        <StaggerItem order={4}>
                            <p className="pt-2 text-center text-xs text-muted-foreground/80">
                                Built from {insights.sessionsConsidered} replay
                                {insights.sessionsConsidered === 1
                                    ? ""
                                    : "s"}{" "}
                                and {insights.capturesConsidered} conversation
                                {insights.capturesConsidered === 1 ? "" : "s"} ·
                                Updated {formatRelativeTime(insights.updatedAt)}
                            </p>
                        </StaggerItem>
                    ) : null}
                </>
            )}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-6">
            {/* Echoes the editorial big-picture header (label + lines + rule),
                then quiet line pulses for the divided briefing list below it. */}
            <div className="space-y-3 border-b border-border/60 pb-6">
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
            </div>
            <div className="space-y-4">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
                <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
            </div>
        </div>
    );
}

/**
 * Shown before the first synthesis lands. Card-less left-aligned prose matching
 * CapturesEmptyState; an inline spinner sits by the heading while the
 * background refresh is in flight.
 */
function FirstRunState({ refreshing }: { refreshing: boolean }) {
    return (
        <div>
            <Eyebrow tone="sky">Getting ready</Eyebrow>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight">
                {refreshing ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-sky-600" />
                ) : null}
                {refreshing
                    ? "Pulling your patterns together…"
                    : "Preparing your focus view"}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {refreshing
                    ? "This can take up to a minute the first time."
                    : "Give it a moment. This rebuilds from your conversations and replays."}
            </p>
        </div>
    );
}

/** Shown when there's real data but too little to surface patterns yet. */
function InsufficientDataState() {
    return (
        <div>
            <Eyebrow tone="sky">Getting started</Eyebrow>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
                Not enough to go on yet
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                A few more conversations and we&apos;ll surface the patterns
                that are actually costing you, plus what&apos;s improving.
            </p>
        </div>
    );
}
