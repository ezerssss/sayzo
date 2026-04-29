"use client";

import { DataTable } from "@/app/admin/_components/data-table";
import type { SessionType } from "@/types/sessions";

export function SessionsPanel({
    sessions,
}: {
    sessions: SessionType[];
}) {
    return (
        <section className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">
                    Sessions ({sessions.length})
                </h2>
                <span className="text-xs text-muted-foreground">
                    Newest 25
                </span>
            </header>
            <div className="p-3">
                <DataTable
                    rows={sessions}
                    rowKey={(s) => s.id}
                    empty="No sessions for this user."
                    columns={[
                        {
                            key: "category",
                            header: "Scenario",
                            cell: (s) => (
                                <div className="flex flex-col">
                                    <span className="font-medium text-foreground">
                                        {s.plan?.scenario?.title ?? "(no title)"}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                        {s.plan?.scenario?.category ?? "—"}
                                    </span>
                                </div>
                            ),
                        },
                        {
                            key: "completion",
                            header: "Completion",
                            cell: (s) => (
                                <span className="text-xs">
                                    {s.completionStatus}
                                </span>
                            ),
                        },
                        {
                            key: "processing",
                            header: "Processing",
                            cell: (s) => (
                                <span
                                    className={
                                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                                        (s.processingStatus === "failed"
                                            ? "bg-destructive/10 text-destructive"
                                            : s.processingStatus ===
                                                "processing"
                                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                              : "bg-muted text-muted-foreground")
                                    }
                                >
                                    {s.processingStatus ?? "idle"}
                                </span>
                            ),
                        },
                        {
                            key: "type",
                            header: "Type",
                            cell: (s) => (
                                <span className="text-xs text-muted-foreground">
                                    {s.type ?? "drill"}
                                </span>
                            ),
                        },
                        {
                            key: "created",
                            header: "Created",
                            cell: (s) => (
                                <span className="text-xs text-muted-foreground">
                                    {s.createdAt
                                        ? new Date(s.createdAt).toLocaleString()
                                        : "—"}
                                </span>
                            ),
                        },
                        {
                            key: "id",
                            header: "ID",
                            cell: (s) => (
                                <code className="text-[10px] text-muted-foreground">
                                    {s.id.slice(0, 8)}
                                </code>
                            ),
                        },
                    ]}
                />
            </div>
        </section>
    );
}
