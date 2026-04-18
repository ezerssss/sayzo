"use client";

import { useMemo } from "react";
import { Flame } from "lucide-react";

import type { SessionType } from "@/types/sessions";
import { cn } from "@/lib/utils";

const HEATMAP_WEEKS = 12;
const HEATMAP_DAYS = HEATMAP_WEEKS * 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function startOfLocalDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function formatFriendlyDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

type StreakStats = {
    currentStreak: number;
    longestStreak: number;
    completedCount: number;
    cells: { key: string; date: Date; count: number; isToday: boolean }[];
};

function computeStats(sessions: SessionType[]): StreakStats {
    const counts = new Map<string, number>();
    let completedCount = 0;

    for (const session of sessions) {
        if (session.completionStatus !== "passed") continue;
        const d = new Date(session.createdAt);
        if (Number.isNaN(d.getTime())) continue;
        const key = localDateKey(d);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        completedCount += 1;
    }

    const today = startOfLocalDay(new Date());
    const todayKey = localDateKey(today);

    let currentStreak = 0;
    let cursor = today;
    if (!counts.has(todayKey)) {
        cursor = addDays(today, -1);
    }
    while (counts.has(localDateKey(cursor))) {
        currentStreak += 1;
        cursor = addDays(cursor, -1);
    }

    const sortedKeys = Array.from(counts.keys()).sort();
    let longestStreak = 0;
    let run = 0;
    let prevKey: string | null = null;
    for (const key of sortedKeys) {
        if (prevKey === null) {
            run = 1;
        } else {
            const prevDate = new Date(`${prevKey}T00:00:00`);
            const currDate = new Date(`${key}T00:00:00`);
            const diff = Math.round(
                (currDate.getTime() - prevDate.getTime()) / DAY_MS,
            );
            run = diff === 1 ? run + 1 : 1;
        }
        if (run > longestStreak) longestStreak = run;
        prevKey = key;
    }

    const cells: StreakStats["cells"] = [];
    const start = addDays(today, -(HEATMAP_DAYS - 1));
    for (let i = 0; i < HEATMAP_DAYS; i++) {
        const date = addDays(start, i);
        const key = localDateKey(date);
        cells.push({
            key,
            date,
            count: counts.get(key) ?? 0,
            isToday: key === todayKey,
        });
    }

    return { currentStreak, longestStreak, completedCount, cells };
}

function intensityClass(count: number): string {
    if (count === 0) return "bg-muted/50 ring-1 ring-inset ring-border/40";
    if (count === 1) return "bg-emerald-200";
    if (count === 2) return "bg-emerald-400";
    return "bg-emerald-600";
}

export function StreakDashboard({ sessions }: { sessions: SessionType[] }) {
    const stats = useMemo(() => computeStats(sessions), [sessions]);
    const { currentStreak, longestStreak, completedCount, cells } = stats;

    const weekColumns = useMemo(() => {
        const weeks: (typeof cells)[] = [];
        for (let w = 0; w < HEATMAP_WEEKS; w++) {
            weeks.push(cells.slice(w * 7, w * 7 + 7));
        }
        return weeks;
    }, [cells]);

    const headline =
        currentStreak > 0
            ? `${currentStreak} day streak`
            : completedCount > 0
              ? "Start a new streak today"
              : "Finish a drill to start your streak";

    return (
        <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                    <div
                        className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                            currentStreak > 0
                                ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
                                : "bg-muted text-muted-foreground ring-1 ring-border/60",
                        )}
                    >
                        <Flame className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Your progress
                        </p>
                        <h2 className="text-xl font-semibold tracking-tight">
                            {headline}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {completedCount > 0
                                ? `${completedCount} completed · Longest streak: ${longestStreak} day${longestStreak === 1 ? "" : "s"}`
                                : "Every completed drill marks the day green."}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                    <div
                        className="grid grid-flow-col grid-rows-7 gap-[3px]"
                        role="img"
                        aria-label={`Last ${HEATMAP_WEEKS} weeks of drill activity`}
                    >
                        {weekColumns.map((week, wi) =>
                            week.map((cell) => (
                                <div
                                    key={cell.key}
                                    title={`${formatFriendlyDate(cell.date)} — ${cell.count} drill${cell.count === 1 ? "" : "s"}`}
                                    className={cn(
                                        "h-3 w-3 rounded-[3px]",
                                        intensityClass(cell.count),
                                        cell.isToday &&
                                            "ring-1 ring-offset-1 ring-offset-card ring-foreground/60",
                                    )}
                                    data-week={wi}
                                />
                            )),
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>Less</span>
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-muted/50 ring-1 ring-inset ring-border/40" />
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-200" />
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-400" />
                        <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-600" />
                        <span>More</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
