"use client";

import { DataTable } from "@/app/admin/_components/data-table";
import type { CaptureType } from "@/types/captures";

export function CapturesPanel({
    captures,
}: {
    captures: CaptureType[];
}) {
    return (
        <section className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">
                    Captures ({captures.length})
                </h2>
                <span className="text-xs text-muted-foreground">Newest 25</span>
            </header>
            <div className="p-3">
                <DataTable
                    rows={captures}
                    rowKey={(c) => c.id ?? ""}
                    empty="No captures for this user."
                    columns={[
                        {
                            key: "title",
                            header: "Title",
                            cell: (c) => (
                                <div className="flex flex-col">
                                    <span className="font-medium text-foreground">
                                        {c.title || "(no title)"}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground line-clamp-1">
                                        {c.summary || "—"}
                                    </span>
                                </div>
                            ),
                        },
                        {
                            key: "status",
                            header: "Status",
                            cell: (c) => (
                                <span
                                    className={
                                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                                        (c.status.endsWith("_failed")
                                            ? "bg-destructive/10 text-destructive"
                                            : c.status === "analyzed"
                                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                              : "bg-muted text-muted-foreground")
                                    }
                                >
                                    {c.status}
                                </span>
                            ),
                        },
                        {
                            key: "duration",
                            header: "Duration",
                            cell: (c) =>
                                c.durationSecs ? (
                                    <span className="text-xs">
                                        {formatDuration(c.durationSecs)}
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        —
                                    </span>
                                ),
                        },
                        {
                            key: "uploaded",
                            header: "Uploaded",
                            cell: (c) => (
                                <span className="text-xs text-muted-foreground">
                                    {c.uploadedAt
                                        ? new Date(
                                              c.uploadedAt,
                                          ).toLocaleString()
                                        : "—"}
                                </span>
                            ),
                        },
                        {
                            key: "id",
                            header: "ID",
                            cell: (c) => (
                                <code className="text-[10px] text-muted-foreground">
                                    {c.id?.slice(0, 8)}
                                </code>
                            ),
                        },
                    ]}
                />
            </div>
        </section>
    );
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}
