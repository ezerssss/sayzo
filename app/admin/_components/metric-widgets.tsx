"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A labeled section wrapper used across the metrics dashboards. */
export function MetricPanel({
    title,
    description,
    children,
    actions,
}: {
    title: string;
    description?: ReactNode;
    children: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {description ? (
                        <p className="text-xs text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
                {actions}
            </div>
            {children}
        </section>
    );
}

/** A single stat: big number + label, with an optional sub-line. */
export function StatCard({
    label,
    value,
    sub,
    tone = "default",
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    tone?: "default" | "good" | "warn" | "bad";
}) {
    const toneClass =
        tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : tone === "bad"
                ? "text-destructive"
                : "text-foreground";
    return (
        <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-background/40 px-3 py-2.5">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <span
                className={cn("text-xl font-semibold tabular-nums", toneClass)}
            >
                {value}
            </span>
            {sub ? (
                <span className="text-[11px] text-muted-foreground">{sub}</span>
            ) : null}
        </div>
    );
}

export function StatGrid({ children }: { children: ReactNode }) {
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {children}
        </div>
    );
}

export type DistributionRow = { label: string; count: number };

/**
 * Horizontal distribution: one row per category with a proportional bar and a
 * count + percentage. `total` defaults to the sum of counts; pass it explicitly
 * to compute percentages against a different denominator.
 */
export function DistributionBars({
    rows,
    total,
    emptyLabel = "No data in this window.",
}: {
    rows: DistributionRow[];
    total?: number;
    emptyLabel?: string;
}) {
    const sum = total ?? rows.reduce((acc, r) => acc + r.count, 0);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const nonZero = rows.filter((r) => r.count > 0);

    if (nonZero.length === 0) {
        return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
    }

    return (
        <div className="flex flex-col gap-1.5">
            {rows.map((r) => {
                const pct = sum > 0 ? Math.round((r.count / sum) * 100) : 0;
                return (
                    <div
                        key={r.label}
                        className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-2"
                    >
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                            {r.label}
                        </span>
                        <span className="relative h-3 overflow-hidden rounded bg-muted">
                            <span
                                className="absolute inset-y-0 left-0 rounded bg-foreground/30"
                                style={{
                                    width: `${Math.round((r.count / max) * 100)}%`,
                                }}
                            />
                        </span>
                        <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                            {r.count}
                            <span className="ml-1 text-muted-foreground/60">
                                {pct}%
                            </span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/** "Last 7 / 30 / 90 days" window selector. */
export const RANGE_OPTIONS = [7, 30, 90] as const;

export function RangeTabs({
    days,
    onChange,
}: {
    days: number;
    onChange: (days: number) => void;
}) {
    return (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/40 p-0.5">
            {RANGE_OPTIONS.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    onClick={() => onChange(opt)}
                    className={cn(
                        "rounded-md px-2.5 py-1 text-xs transition-colors",
                        days === opt
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {opt}d
                </button>
            ))}
        </div>
    );
}

/** Shared helper: ISO timestamp for `days` ago, for the `?from=` query param. */
export function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
