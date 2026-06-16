"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import {
    DistributionBars,
    MetricPanel,
    RangeTabs,
    StatCard,
    StatGrid,
    isoDaysAgo,
} from "@/app/admin/_components/metric-widgets";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type {
    Cohorts,
    ErrorClusters,
    LatencyStats,
} from "@/lib/admin/metrics-l1";
import type { AdminAlert, AlertStatus } from "@/schemas";

type AlertRow = AdminAlert & { id: string };

type Envelope<T> = {
    window: { fromIso: string; toIso: string; days: number };
    data: T;
    indexHint?: string;
};

function fmtSecs(secs: number): string {
    if (secs <= 0) return "—";
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
}

export default function AdminMetricsPage() {
    const [days, setDays] = useState(30);
    const [latency, setLatency] = useState<LatencyStats | null>(null);
    const [errors, setErrors] = useState<ErrorClusters | null>(null);
    const [cohorts, setCohorts] = useState<Cohorts | null>(null);
    const [alerts, setAlerts] = useState<AlertRow[]>([]);
    const [hint, setHint] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadAlerts = useCallback(async () => {
        try {
            const res = await api
                .get("/api/admin/alerts", { timeout: 20_000 })
                .json<{ alerts: AlertRow[] }>();
            setAlerts(res.alerts);
        } catch {
            // Non-fatal — metrics still render without the alert list.
        }
    }, []);

    const updateAlert = useCallback(
        async (id: string, status: AlertStatus) => {
            try {
                await api.patch("/api/admin/alerts", { json: { id, status } });
                await loadAlerts();
            } catch (e) {
                setError(await getKyErrorMessage(e, "Could not update alert."));
            }
        },
        [loadAlerts],
    );

    const load = useCallback(async (rangeDays: number) => {
        setLoading(true);
        setError(null);
        try {
            const searchParams = { from: isoDaysAgo(rangeDays) };
            const [lat, err, coh] = await Promise.all([
                api
                    .get("/api/admin/metrics/latency", {
                        searchParams,
                        timeout: 60_000,
                    })
                    .json<Envelope<LatencyStats>>(),
                api
                    .get("/api/admin/metrics/errors", {
                        searchParams,
                        timeout: 60_000,
                    })
                    .json<Envelope<ErrorClusters>>(),
                api
                    .get("/api/admin/metrics/cohorts", {
                        searchParams,
                        timeout: 60_000,
                    })
                    .json<Envelope<Cohorts>>(),
            ]);
            setLatency(lat.data);
            setErrors(err.data);
            setCohorts(coh.data);
            setHint(lat.indexHint ?? err.indexHint ?? coh.indexHint ?? null);
        } catch (e) {
            setError(await getKyErrorMessage(e, "Could not load metrics."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(days);
    }, [load, days]);

    useEffect(() => {
        void loadAlerts();
    }, [loadAlerts]);

    return (
        <div className="flex flex-1 flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Metrics
                </h1>
                <p className="text-sm text-muted-foreground">
                    Pipeline latency, clustered failures, and usage — all
                    derived from stored fields, no transcripts or audio.
                </p>
            </header>

            <RangeTabs days={days} onChange={setDays} />

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

            <MetricPanel
                title="Alerts"
                description="Raised when a monitored rate crosses threshold over the last 24h. Acknowledge to mute the banner; the cron resolves them when the rate recovers."
            >
                <DataTable
                    rows={alerts}
                    rowKey={(a) => a.id}
                    empty="No alerts — all monitored rates are within threshold."
                    columns={[
                        {
                            key: "status",
                            header: "Status",
                            cell: (a) => (
                                <span
                                    className={
                                        "inline-flex rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                                        (a.status === "open"
                                            ? "bg-destructive/10 text-destructive"
                                            : a.status === "acknowledged"
                                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                              : "bg-muted text-muted-foreground")
                                    }
                                >
                                    {a.status}
                                </span>
                            ),
                        },
                        {
                            key: "metric",
                            header: "Metric",
                            cell: (a) => (
                                <span className="font-mono text-xs">
                                    {a.metricKey}
                                </span>
                            ),
                        },
                        {
                            key: "scope",
                            header: "Scope",
                            cell: (a) => (
                                <span className="text-xs text-muted-foreground">
                                    {a.scope.promptKey ?? "all"}
                                </span>
                            ),
                        },
                        {
                            key: "observed",
                            header: "Observed / threshold",
                            cell: (a) => (
                                <span className="tabular-nums text-xs">
                                    {(a.observed * 100).toFixed(1)}% /{" "}
                                    {(a.threshold * 100).toFixed(0)}%
                                    <span className="ml-1 text-muted-foreground/60">
                                        (n={a.sampleSize})
                                    </span>
                                </span>
                            ),
                        },
                        {
                            key: "actions",
                            header: "",
                            cell: (a) =>
                                a.status === "resolved" ? null : (
                                    <div className="flex justify-end gap-1.5">
                                        {a.status === "open" ? (
                                            <Button
                                                size="xs"
                                                variant="outline"
                                                onClick={() =>
                                                    void updateAlert(
                                                        a.id,
                                                        "acknowledged",
                                                    )
                                                }
                                            >
                                                Ack
                                            </Button>
                                        ) : null}
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            onClick={() =>
                                                void updateAlert(
                                                    a.id,
                                                    "resolved",
                                                )
                                            }
                                        >
                                            Resolve
                                        </Button>
                                    </div>
                                ),
                            className: "text-right",
                        },
                    ]}
                />
            </MetricPanel>

            {loading || !latency || !errors || !cohorts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading&hellip;
                </div>
            ) : (
                <>
                    <MetricPanel
                        title="Pipeline latency (upload → analyzed)"
                        description={`Includes queue wait + analysis. ${latency.sampleCount} captures sampled.`}
                    >
                        <StatGrid>
                            <StatCard
                                label="p50"
                                value={fmtSecs(latency.p50Secs)}
                            />
                            <StatCard
                                label="p90"
                                value={fmtSecs(latency.p90Secs)}
                            />
                            <StatCard
                                label="p95"
                                value={fmtSecs(latency.p95Secs)}
                                tone="warn"
                            />
                            <StatCard
                                label="p99"
                                value={fmtSecs(latency.p99Secs)}
                                tone="warn"
                            />
                            <StatCard
                                label="max"
                                value={fmtSecs(latency.maxSecs)}
                            />
                        </StatGrid>
                        <DistributionBars
                            rows={Object.entries(latency.histogram).map(
                                ([label, count]) => ({ label, count }),
                            )}
                            total={latency.sampleCount}
                        />
                    </MetricPanel>

                    <MetricPanel
                        title="Failure clusters"
                        description={`${errors.failedCaptures} failed captures · ${errors.failedSessions} failed sessions. Errors grouped by signature (ids/numbers/quoted text stripped).`}
                    >
                        <DataTable
                            rows={errors.clusters}
                            rowKey={(c) => `${c.source}:${c.signature}`}
                            empty="No failures in this window."
                            columns={[
                                {
                                    key: "count",
                                    header: "Count",
                                    cell: (c) => (
                                        <span className="tabular-nums">
                                            {c.count}
                                        </span>
                                    ),
                                    className: "w-16",
                                },
                                {
                                    key: "source",
                                    header: "Source",
                                    cell: (c) => (
                                        <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                            {c.source}
                                        </span>
                                    ),
                                    className: "w-24",
                                },
                                {
                                    key: "signature",
                                    header: "Signature",
                                    cell: (c) => (
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {c.signature}
                                        </span>
                                    ),
                                },
                            ]}
                        />
                    </MetricPanel>

                    <MetricPanel
                        title="Usage & retention"
                        description="Active = a desktop companion checked in within the window."
                    >
                        <StatGrid>
                            <StatCard
                                label="Total users"
                                value={cohorts.totalUsers}
                            />
                            <StatCard
                                label="Onboarded"
                                value={cohorts.onboardingComplete}
                            />
                            <StatCard
                                label="Full access"
                                value={cohorts.fullAccess}
                            />
                            <StatCard
                                label="Active 7d"
                                value={cohorts.activeLast7d}
                                tone="good"
                            />
                            <StatCard
                                label="Active 30d"
                                value={cohorts.activeLast30d}
                            />
                            <StatCard
                                label="Captures (window)"
                                value={cohorts.capturesInWindow}
                            />
                            <StatCard
                                label="Sessions (window)"
                                value={cohorts.sessionsInWindow}
                            />
                        </StatGrid>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xs font-medium text-muted-foreground">
                                    Signups by week
                                </h3>
                                <DistributionBars
                                    rows={cohorts.signupsByWeek.map((r) => ({
                                        label: r.week,
                                        count: r.count,
                                    }))}
                                    emptyLabel="No signups in range."
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <h3 className="text-xs font-medium text-muted-foreground">
                                    Captures by day
                                </h3>
                                <DistributionBars
                                    rows={cohorts.capturesByDay.map((r) => ({
                                        label: r.day,
                                        count: r.count,
                                    }))}
                                    emptyLabel="No captures in range."
                                />
                            </div>
                        </div>
                    </MetricPanel>
                </>
            )}
        </div>
    );
}
