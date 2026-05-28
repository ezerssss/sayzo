"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { CaptureType, CoachingInsight } from "@/schemas";

type ReanalyzeResponse = {
    ok: true;
    elapsedMs: number;
    currentInsight: CoachingInsight | null;
    newInsight: CoachingInsight | null;
};

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
                        {
                            key: "insight",
                            header: "Insight",
                            cell: (c) => (
                                <InsightReplayButton capture={c} />
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

/**
 * Per-row "Re-run insight" button. Opens a dialog that shows the capture's
 * currently-persisted `coachingInsight` and a button to re-run the analyzer
 * on the existing transcript. Preview only — never writes back.
 */
function InsightReplayButton({ capture }: { capture: CaptureType }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ReanalyzeResponse | null>(null);

    const captureId = capture.id ?? "";
    const currentInsight =
        result?.currentInsight ?? capture.analysis?.coachingInsight ?? null;

    const onRerun = async () => {
        if (!captureId) return;
        setBusy(true);
        setError(null);
        try {
            const data = await api
                .post(
                    `/api/admin/captures/${captureId}/reanalyze-insight`,
                    // 10 min — reasoning models (gpt-5+) can chain-of-thought
                    // for 3-5+ min on long captures. Chat models finish in
                    // under a minute, so this is mostly a ceiling for the
                    // worst case.
                    { timeout: 600_000 },
                )
                .json<ReanalyzeResponse>();
            setResult(data);
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Could not re-run insight."),
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={!captureId}
                className="h-7 gap-1 text-xs"
            >
                <Sparkles className="size-3" />
                Re-run
            </Button>
            <Dialog
                open={open}
                onOpenChange={(o) => {
                    setOpen(o);
                    if (!o) {
                        setResult(null);
                        setError(null);
                    }
                }}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Re-run coaching insight</DialogTitle>
                        <DialogDescription>
                            Re-runs the analyzer on this capture&apos;s
                            existing transcript and shows the new insight.
                            Preview only — nothing is written back. Reasoning
                            models (gpt-5+) can take a few minutes; chat models
                            finish in under a minute.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3">
                        <InsightBlock
                            label="Current (persisted)"
                            insight={currentInsight}
                        />
                        <InsightBlock
                            label={
                                result
                                    ? `New (re-run in ${(result.elapsedMs / 1000).toFixed(1)}s)`
                                    : "New (after re-run)"
                            }
                            insight={result?.newInsight ?? null}
                            placeholder={
                                busy
                                    ? "Running…"
                                    : "Click Re-run insight to generate."
                            }
                        />
                    </div>

                    {error ? (
                        <p className="text-xs text-destructive">{error}</p>
                    ) : null}

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpen(false)}
                            disabled={busy}
                        >
                            Close
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                void onRerun();
                            }}
                            disabled={!captureId || busy}
                        >
                            {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="size-3.5" />
                            )}
                            {result ? "Re-run again" : "Re-run insight"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function InsightBlock({
    label,
    insight,
    placeholder,
}: {
    label: string;
    insight: CoachingInsight | null;
    placeholder?: string;
}) {
    return (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            {insight ? (
                <div className="mt-2 grid gap-1.5 text-sm">
                    <Field label="Type" value={insight.type} mono />
                    <Field label="Headline" value={insight.headline} />
                    <Field
                        label="Quote"
                        value={insight.quote ?? "—"}
                        italic={!!insight.quote}
                    />
                    <Field label="Body" value={insight.body} />
                    <Field label="Why" value={insight.why ?? "—"} />
                </div>
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                    {placeholder ??
                        "No coaching insight on this capture (returned null)."}
                </p>
            )}
        </div>
    );
}

function Field({
    label,
    value,
    mono,
    italic,
}: {
    label: string;
    value: string;
    mono?: boolean;
    italic?: boolean;
}) {
    return (
        <div className="grid grid-cols-[64px_1fr] gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <span
                className={
                    "text-xs leading-relaxed text-foreground " +
                    (mono ? "font-mono " : "") +
                    (italic ? "italic " : "")
                }
            >
                {value}
            </span>
        </div>
    );
}
