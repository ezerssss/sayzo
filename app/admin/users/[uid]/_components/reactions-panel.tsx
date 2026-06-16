"use client";

import { DataTable } from "@/app/admin/_components/data-table";
import type { ItemReaction } from "@/schemas";

type ReactionRow = ItemReaction & { id: string };

export function ReactionsPanel({ reactions }: { reactions: ReactionRow[] }) {
    return (
        <section className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">
                    Reactions ({reactions.length})
                </h2>
                <span className="text-xs text-muted-foreground">
                    Thumbs on coaching output
                </span>
            </header>
            <div className="p-3">
                <DataTable
                    rows={reactions}
                    rowKey={(r) => r.id}
                    empty="No reactions from this user yet."
                    columns={[
                        {
                            key: "rating",
                            header: "Rating",
                            cell: (r) => (
                                <span
                                    className={
                                        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                                        (r.rating === "up"
                                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                            : "bg-destructive/10 text-destructive")
                                    }
                                >
                                    {r.rating === "up" ? "▲ up" : "▼ down"}
                                </span>
                            ),
                        },
                        {
                            key: "source",
                            header: "On",
                            cell: (r) => (
                                <span className="text-xs text-muted-foreground">
                                    {r.source} · {r.target}
                                </span>
                            ),
                        },
                        {
                            key: "reasonCode",
                            header: "Reason",
                            cell: (r) => (
                                <span className="text-xs">
                                    {r.reasonCode ?? "—"}
                                </span>
                            ),
                        },
                        {
                            key: "reason",
                            header: "Note",
                            cell: (r) => (
                                <span className="line-clamp-2 text-xs text-muted-foreground">
                                    {r.reason || "—"}
                                </span>
                            ),
                        },
                        {
                            key: "item",
                            header: "Item",
                            cell: (r) => (
                                <code className="text-[10px] text-muted-foreground">
                                    {r.itemId.slice(0, 8)}
                                </code>
                            ),
                        },
                        {
                            key: "updated",
                            header: "Updated",
                            cell: (r) => (
                                <span className="text-xs text-muted-foreground">
                                    {r.updatedAt
                                        ? new Date(r.updatedAt).toLocaleString()
                                        : "—"}
                                </span>
                            ),
                        },
                    ]}
                />
            </div>
        </section>
    );
}
