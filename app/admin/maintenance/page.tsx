"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, NotebookText, OctagonX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

type BatchResult = {
    scanned: number;
    skipped: number;
    written: number;
    empty: number;
    failed: number;
    nextCursor: string | null;
};

type Totals = Omit<BatchResult, "nextCursor"> & { batches: number };

const ZERO_TOTALS: Totals = {
    scanned: 0,
    skipped: 0,
    written: 0,
    empty: 0,
    failed: 0,
    batches: 0,
};

/**
 * One-off maintenance tools. Currently: the conversation-summary backfill,
 * which drives POST /api/admin/captures/backfill-summaries batch-by-batch
 * (the route is cursor-paginated so each call stays inside the function
 * timeout) until the cursor comes back null. Idempotent — re-running skips
 * captures that already have a summary.
 */
export default function AdminMaintenancePage() {
    const [running, setRunning] = useState(false);
    const [totals, setTotals] = useState<Totals>(ZERO_TOTALS);
    const [finished, setFinished] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const stopRequestedRef = useRef(false);

    const runBackfill = async () => {
        setRunning(true);
        setFinished(false);
        setError(null);
        setTotals(ZERO_TOTALS);
        stopRequestedRef.current = false;

        let cursor: string | null = null;
        try {
            do {
                const res: BatchResult = await api
                    .post("/api/admin/captures/backfill-summaries", {
                        json: { limit: 5, ...(cursor ? { cursor } : {}) },
                        timeout: 120_000,
                    })
                    .json<BatchResult>();
                setTotals((t) => ({
                    scanned: t.scanned + res.scanned,
                    skipped: t.skipped + res.skipped,
                    written: t.written + res.written,
                    empty: t.empty + res.empty,
                    failed: t.failed + res.failed,
                    batches: t.batches + 1,
                }));
                cursor = res.nextCursor;
            } while (cursor && !stopRequestedRef.current);
            setFinished(cursor === null);
        } catch (err) {
            setError(await getKyErrorMessage(err, "Backfill batch failed."));
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Maintenance
                </h1>
                <p className="text-sm text-muted-foreground">
                    One-off tools. Each runs in small batches and is safe to
                    re-run.
                </p>
            </header>

            <section className="max-w-2xl rounded-lg border border-border p-4">
                <div className="flex items-start gap-3">
                    <NotebookText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                        <h2 className="text-sm font-semibold">
                            Backfill conversation summaries
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Generates{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                                meetingSummary
                            </code>{" "}
                            for analyzed captures that predate the feature (or
                            whose generation failed). Skips captures that
                            already have one — one small-model call per
                            backfilled capture.
                        </p>

                        <div className="mt-3 flex items-center gap-2">
                            {running ? (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        stopRequestedRef.current = true;
                                    }}
                                >
                                    <OctagonX className="size-3.5" />
                                    Stop after this batch
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        void runBackfill();
                                    }}
                                >
                                    Run backfill
                                </Button>
                            )}
                            {running ? (
                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Loader2 className="size-3.5 animate-spin" />
                                    Batch {totals.batches + 1}&hellip;
                                </span>
                            ) : null}
                        </div>

                        {totals.batches > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                    <strong className="text-foreground">
                                        {totals.written}
                                    </strong>{" "}
                                    written
                                </span>
                                <span>{totals.skipped} already had one</span>
                                <span>{totals.empty} produced nothing</span>
                                <span
                                    className={
                                        totals.failed > 0
                                            ? "text-destructive"
                                            : undefined
                                    }
                                >
                                    {totals.failed} failed
                                </span>
                                <span>
                                    {totals.scanned} scanned /{" "}
                                    {totals.batches}{" "}
                                    {totals.batches === 1
                                        ? "batch"
                                        : "batches"}
                                </span>
                            </div>
                        ) : null}

                        {finished ? (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                                <CheckCircle2 className="size-3.5" />
                                Done — no more captures to backfill.
                            </p>
                        ) : null}
                        {error ? (
                            <p className="mt-2 text-xs text-destructive">
                                {error} You can re-run safely — finished
                                captures are skipped.
                            </p>
                        ) : null}
                    </div>
                </div>
            </section>
        </div>
    );
}
