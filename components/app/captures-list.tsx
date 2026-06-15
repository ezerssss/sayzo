"use client";

import Link from "next/link";

import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import type { CaptureType } from "@/schemas";

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return dateStr;
    }
}

function formatDuration(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

/**
 * The full conversation list — clean, navigation-only rows (deletion lives on
 * each conversation's detail page, so the list stays uncluttered). Used by the
 * /app/conversations "All conversations" page and the overview's mobile list
 * (where the sidebar rail is hidden).
 */
export function CapturesList({
    captures,
}: Readonly<{ captures: CaptureType[] }>) {
    return (
        <div className="divide-y divide-border/50">
            {captures.map((capture, idx) => {
                const captureId = capture.id ?? `capture-${idx}`;
                const title = capture.serverTitle ?? capture.title;
                const duration = formatDuration(capture.durationSecs);

                return (
                    <Link
                        key={captureId}
                        href={`/app/conversations/${captureId}`}
                        className="group -mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-3 transition-colors first:pt-0 hover:bg-sky-50/30"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                                {title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                    {formatDate(capture.startedAt)}
                                </span>
                                {duration && (
                                    <>
                                        <span className="text-xs text-muted-foreground/50">
                                            &middot;
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {duration}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <CaptureStatusBadge
                            status={capture.status}
                            rejectionReason={capture.rejectionReason}
                            error={capture.error}
                        />
                    </Link>
                );
            })}
        </div>
    );
}
