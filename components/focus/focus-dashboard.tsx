"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCcw, Target } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
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

export function FocusDashboard({
    uid,
    onStartDrill,
}: {
    uid: string | undefined;
    onStartDrill?: () => void;
}) {
    const { insights, loading, refreshing, error, refresh } = useFocusInsights(uid);

    const hasInsights = insights !== null;
    const isEmpty = insights?.insufficientData === true;
    const themes = insights?.themes ?? [];
    const wins = insights?.wins ?? [];

    return (
        <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Focus</h2>
                    <p className="text-sm text-muted-foreground">
                        Where to put your attention — built from every drill and capture so far.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void refresh()}
                    disabled={refreshing || !uid}
                    title="Rebuild from your latest drills and captures"
                >
                    {refreshing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                    Refresh
                </Button>
            </div>

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
                <InsufficientDataState onStartDrill={onStartDrill} />
            ) : (
                <>
                    {insights?.overview?.trim() ? (
                        <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-6 shadow-sm">
                            <div className="flex items-start gap-3">
                                <div className="shrink-0 rounded-lg bg-white/80 p-2 ring-1 ring-sky-100">
                                    <Target className="h-4 w-4 text-sky-600" />
                                </div>
                                <p className="text-sm leading-relaxed text-foreground/90 sm:text-base">
                                    {insights?.overview}
                                </p>
                            </div>
                        </div>
                    ) : null}

                    {themes.length > 0 ? (
                        <section className="space-y-3">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                What to work on ({themes.length})
                            </h3>
                            <div className="space-y-3">
                                {themes.map((theme) => (
                                    <FocusThemeCard key={theme.id} theme={theme} />
                                ))}
                            </div>
                        </section>
                    ) : null}

                    {wins.length > 0 ? (
                        <section className="space-y-3">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                What&apos;s changing ({wins.length})
                            </h3>
                            <ul className="space-y-2">
                                {wins.map((win, idx) => (
                                    <li
                                        key={idx}
                                        className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
                                    >
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-foreground/90">
                                                {win.statement}
                                            </p>
                                            {win.lastSeen ? (
                                                <Link
                                                    href={
                                                        win.lastSeen.source === "session"
                                                            ? `/app/drills/${win.lastSeen.sourceId}/summary`
                                                            : `/app/conversations/${win.lastSeen.sourceId}`
                                                    }
                                                    className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                >
                                                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                                        {win.lastSeen.source === "session"
                                                            ? "Drill"
                                                            : "Capture"}
                                                    </span>
                                                    <span className="truncate">
                                                        Last seen in &ldquo;{win.lastSeen.sourceTitle}&rdquo;
                                                    </span>
                                                </Link>
                                            ) : null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ) : null}

                    {insights ? (
                        <p className="pt-2 text-center text-xs text-muted-foreground/80">
                            Built from {insights.sessionsConsidered} drill
                            {insights.sessionsConsidered === 1 ? "" : "s"} and{" "}
                            {insights.capturesConsidered} capture
                            {insights.capturesConsidered === 1 ? "" : "s"} · Updated{" "}
                            {formatRelativeTime(insights.updatedAt)}
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
            <div className="h-40 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
            <div className="h-40 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
        </div>
    );
}

function FirstRunState({ refreshing }: { refreshing: boolean }) {
    return (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border/60">
                {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                    <Target className="h-4 w-4 text-muted-foreground" />
                )}
            </div>
            <p className="mt-4 text-sm font-medium">
                {refreshing
                    ? "Pulling your patterns together…"
                    : "Preparing your focus view"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
                {refreshing
                    ? "This can take up to a minute the first time."
                    : "Give it a moment — this rebuilds from your drills and captures."}
            </p>
        </div>
    );
}

function InsufficientDataState({
    onStartDrill,
}: {
    onStartDrill?: () => void;
}) {
    return (
        <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border/60">
                <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium">
                Not enough to go on yet
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                A few more drills or a real conversation capture and we&apos;ll
                surface the patterns that are actually costing you — plus what&apos;s
                improving.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
                {onStartDrill ? (
                    <Button size="sm" onClick={onStartDrill}>
                        Start a drill
                    </Button>
                ) : null}
                <Link
                    href="/install"
                    className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                >
                    Install capture companion
                </Link>
            </div>
        </div>
    );
}
