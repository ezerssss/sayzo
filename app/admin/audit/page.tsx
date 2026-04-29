"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { AuditLogEntry } from "@/types/audit-log";

type Entry = AuditLogEntry & { id: string };
type ListResponse = {
    entries: Entry[];
    nextCursor: string | null;
};

export default function AdminAuditPage() {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(
        async (params: { cursor: string | null; append: boolean }) => {
            const setLoader = params.append ? setLoadingMore : setLoading;
            setLoader(true);
            setError(null);
            try {
                const search = new URLSearchParams();
                if (params.cursor) search.set("cursor", params.cursor);
                const data = await api
                    .get(`/api/admin/audit?${search.toString()}`, {
                        timeout: 30_000,
                    })
                    .json<ListResponse>();
                setEntries((prev) =>
                    params.append ? [...prev, ...data.entries] : data.entries,
                );
                setCursor(data.nextCursor);
            } catch (err) {
                setError(
                    await getKyErrorMessage(err, "Could not load audit log."),
                );
            } finally {
                setLoader(false);
            }
        },
        [],
    );

    useEffect(() => {
        void load({ cursor: null, append: false });
    }, [load]);

    return (
        <div className="flex flex-1 flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Audit log
                </h1>
                <p className="text-sm text-muted-foreground">
                    Append-only record of every admin action. Click a row to see
                    the before/after snapshots.
                </p>
            </header>

            {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading&hellip;
                </div>
            ) : (
                <DataTable
                    rows={entries}
                    rowKey={(e) => e.id}
                    empty="No audit entries yet."
                    onRowClick={(e) =>
                        setExpandedId(expandedId === e.id ? null : e.id)
                    }
                    columns={[
                        {
                            key: "createdAt",
                            header: "When",
                            cell: (e) => (
                                <span className="text-xs">
                                    {e.createdAt
                                        ? new Date(e.createdAt).toLocaleString()
                                        : "—"}
                                </span>
                            ),
                        },
                        {
                            key: "actor",
                            header: "Actor",
                            cell: (e) => (
                                <span className="text-xs">
                                    {e.actorEmail || (
                                        <code className="text-[11px]">
                                            {e.actorUid.slice(0, 8)}
                                        </code>
                                    )}
                                </span>
                            ),
                        },
                        {
                            key: "action",
                            header: "Action",
                            cell: (e) => (
                                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                                    {e.action}
                                </code>
                            ),
                        },
                        {
                            key: "target",
                            header: "Target",
                            cell: (e) =>
                                e.targetUid ? (
                                    <Link
                                        href={`/admin/users/${e.targetUid}`}
                                        className="text-xs hover:underline"
                                    >
                                        {e.targetUid.slice(0, 8)}
                                    </Link>
                                ) : (
                                    <code className="text-[11px] text-muted-foreground">
                                        {e.targetId.slice(0, 8)}
                                    </code>
                                ),
                        },
                        {
                            key: "diff",
                            header: "Diff",
                            cell: (e) =>
                                expandedId === e.id ? (
                                    <div className="grid gap-2 text-[11px]">
                                        {e.before ? (
                                            <pre className="overflow-x-auto rounded bg-muted p-2">
                                                before:{" "}
                                                {JSON.stringify(
                                                    e.before,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        ) : null}
                                        {e.after ? (
                                            <pre className="overflow-x-auto rounded bg-muted p-2">
                                                after:{" "}
                                                {JSON.stringify(
                                                    e.after,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        ) : null}
                                        {e.metadata ? (
                                            <pre className="overflow-x-auto rounded bg-muted p-2">
                                                meta:{" "}
                                                {JSON.stringify(
                                                    e.metadata,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        ) : null}
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-muted-foreground">
                                        click to expand
                                    </span>
                                ),
                        },
                    ]}
                />
            )}

            {!loading && cursor ? (
                <div className="flex justify-center">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingMore}
                        onClick={() => {
                            void load({ cursor, append: true });
                        }}
                    >
                        {loadingMore ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        Load more
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
