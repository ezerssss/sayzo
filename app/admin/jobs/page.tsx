"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { CaptureType } from "@/types/captures";
import type { SessionType } from "@/types/sessions";

type FailedResponse = {
    sessions: SessionType[];
    captures: CaptureType[];
    indexHint?: string;
};

export default function AdminFailedJobsPage() {
    const [sessions, setSessions] = useState<SessionType[]>([]);
    const [captures, setCaptures] = useState<CaptureType[]>([]);
    const [hint, setHint] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api
                .get("/api/admin/jobs/failed", { timeout: 30_000 })
                .json<FailedResponse>();
            setSessions(data.sessions);
            setCaptures(data.captures);
            setHint(data.indexHint ?? null);
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Could not load failed jobs."),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const retryCapture = async (id: string) => {
        setBusyId(id);
        try {
            await api.post(`/api/admin/captures/${id}/retry`, {
                timeout: 60_000,
            });
            await load();
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not retry capture."));
        } finally {
            setBusyId(null);
        }
    };

    const retrySession = async (id: string) => {
        setBusyId(id);
        try {
            await api.post(`/api/admin/sessions/${id}/retry`, {
                timeout: 30_000,
            });
            await load();
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not retry session."));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Failed jobs
                </h1>
                <p className="text-sm text-muted-foreground">
                    Sessions stuck in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        processingStatus: failed
                    </code>{" "}
                    and captures whose status ends in{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        _failed
                    </code>
                    .
                </p>
            </header>

            {hint ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                    {hint}
                </div>
            ) : null}
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
                <>
                    <section className="flex flex-col gap-3">
                        <h2 className="text-sm font-semibold">
                            Captures ({captures.length})
                        </h2>
                        <DataTable
                            rows={captures}
                            rowKey={(c) => c.id ?? ""}
                            empty="No failed captures."
                            columns={[
                                {
                                    key: "user",
                                    header: "User",
                                    cell: (c) => (
                                        <Link
                                            href={`/admin/users/${c.uid}`}
                                            className="text-xs hover:underline"
                                        >
                                            {c.uid.slice(0, 8)}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "title",
                                    header: "Title",
                                    cell: (c) => (
                                        <span className="line-clamp-1">
                                            {c.title || "—"}
                                        </span>
                                    ),
                                },
                                {
                                    key: "status",
                                    header: "Status",
                                    cell: (c) => (
                                        <span className="inline-flex rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase text-destructive">
                                            {c.status}
                                        </span>
                                    ),
                                },
                                {
                                    key: "error",
                                    header: "Error",
                                    cell: (c) => (
                                        <span className="line-clamp-2 text-xs text-muted-foreground">
                                            {c.error || "—"}
                                        </span>
                                    ),
                                },
                                {
                                    key: "retry",
                                    header: "Retries",
                                    cell: (c) => (
                                        <span className="text-xs">
                                            {c.retryCount ?? 0}
                                        </span>
                                    ),
                                },
                                {
                                    key: "actions",
                                    header: "",
                                    cell: (c) =>
                                        c.id ? (
                                            <Button
                                                size="xs"
                                                variant="outline"
                                                disabled={busyId === c.id}
                                                onClick={() => {
                                                    void retryCapture(c.id!);
                                                }}
                                            >
                                                {busyId === c.id ? (
                                                    <Loader2 className="size-3 animate-spin" />
                                                ) : (
                                                    <RotateCcw className="size-3" />
                                                )}
                                                Retry
                                            </Button>
                                        ) : null,
                                    className: "text-right",
                                },
                            ]}
                        />
                    </section>

                    <section className="flex flex-col gap-3">
                        <h2 className="text-sm font-semibold">
                            Sessions ({sessions.length})
                        </h2>
                        <DataTable
                            rows={sessions}
                            rowKey={(s) => s.id}
                            empty="No failed sessions."
                            columns={[
                                {
                                    key: "user",
                                    header: "User",
                                    cell: (s) => (
                                        <Link
                                            href={`/admin/users/${s.uid}`}
                                            className="text-xs hover:underline"
                                        >
                                            {s.uid.slice(0, 8)}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "scenario",
                                    header: "Scenario",
                                    cell: (s) => (
                                        <span className="line-clamp-1">
                                            {s.plan?.scenario?.title ?? "—"}
                                        </span>
                                    ),
                                },
                                {
                                    key: "stage",
                                    header: "Stage",
                                    cell: (s) => (
                                        <span className="text-xs text-muted-foreground">
                                            {s.processingStage ?? "—"}
                                        </span>
                                    ),
                                },
                                {
                                    key: "error",
                                    header: "Error",
                                    cell: (s) => (
                                        <span className="line-clamp-2 text-xs text-muted-foreground">
                                            {s.processingError ?? "—"}
                                        </span>
                                    ),
                                },
                                {
                                    key: "actions",
                                    header: "",
                                    cell: (s) => (
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={busyId === s.id}
                                            onClick={() => {
                                                void retrySession(s.id);
                                            }}
                                        >
                                            {busyId === s.id ? (
                                                <Loader2 className="size-3 animate-spin" />
                                            ) : (
                                                <RotateCcw className="size-3" />
                                            )}
                                            Reset
                                        </Button>
                                    ),
                                    className: "text-right",
                                },
                            ]}
                        />
                    </section>
                </>
            )}
        </div>
    );
}
