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
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { QualityL1, ReactionAggregate } from "@/lib/admin/metrics-l1";
import type { LlmEventsAggregate } from "@/lib/admin/metrics-events";

type Response = {
    window: { fromIso: string; toIso: string; days: number };
    data: QualityL1;
    reactions: ReactionAggregate;
    indexHint?: string;
};

type LlmResponse = {
    window: { fromIso: string; toIso: string; days: number };
    data: LlmEventsAggregate;
    indexHint?: string;
};

function fmtUsd(n: number): string {
    if (n === 0) return "$0";
    if (n < 0.01) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
}

function fmtMs(ms: number): string {
    if (ms <= 0) return "—";
    return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function topOutcomes(counts: Record<string, number>): string {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return "—";
    return entries
        .slice(0, 2)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ");
}

function pct(part: number, whole: number): string {
    if (whole <= 0) return "—";
    return `${Math.round((part / whole) * 100)}%`;
}

export default function AdminPromptHealthPage() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<QualityL1 | null>(null);
    const [reactions, setReactions] = useState<ReactionAggregate | null>(null);
    const [llm, setLlm] = useState<LlmEventsAggregate | null>(null);
    const [hint, setHint] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (rangeDays: number) => {
        setLoading(true);
        setError(null);
        try {
            const searchParams = { from: isoDaysAgo(rangeDays) };
            const [res, llmRes] = await Promise.all([
                api
                    .get("/api/admin/metrics/quality-l1", {
                        searchParams,
                        timeout: 60_000,
                    })
                    .json<Response>(),
                api
                    .get("/api/admin/metrics/llm", {
                        searchParams,
                        timeout: 60_000,
                    })
                    .json<LlmResponse>(),
            ]);
            setData(res.data);
            setReactions(res.reactions);
            setLlm(llmRes.data);
            setHint(res.indexHint ?? llmRes.indexHint ?? null);
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Could not load prompt health."),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(days);
    }, [load, days]);

    return (
        <div className="flex flex-1 flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Prompt health
                </h1>
                <p className="text-sm text-muted-foreground">
                    How our analysis prompts are landing, aggregated from stored
                    outcomes — no transcripts or audio. Per-prompt-version cost
                    and token metrics arrive once call-level instrumentation
                    ships.
                </p>
            </header>

            <div className="flex items-center justify-between">
                <RangeTabs days={days} onChange={setDays} />
                {data ? (
                    <span className="text-xs text-muted-foreground">
                        {data.capturesScanned} captures · {data.sessionsScanned}{" "}
                        sessions in window
                    </span>
                ) : null}
            </div>

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

            {loading || !data ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading&hellip;
                </div>
            ) : (
                <>
                    {llm ? (
                        <>
                            <MetricPanel
                                title="Operational telemetry"
                                description={`Per-call cost, tokens and latency across all LLM/ASR calls (${llm.eventsScanned} recorded). Only accrues going forward.`}
                            >
                                <StatGrid>
                                    <StatCard
                                        label="Calls"
                                        value={llm.totalCalls}
                                    />
                                    <StatCard
                                        label="Cost"
                                        value={fmtUsd(llm.totalCostUsd)}
                                    />
                                    <StatCard
                                        label="Failures"
                                        value={llm.totalFailures}
                                        tone={
                                            llm.totalCalls > 0 &&
                                            llm.totalFailures / llm.totalCalls >
                                                0.05
                                                ? "bad"
                                                : "default"
                                        }
                                    />
                                    <StatCard
                                        label="Input tokens"
                                        value={llm.totalInputTokens.toLocaleString()}
                                    />
                                    <StatCard
                                        label="Output tokens"
                                        value={llm.totalOutputTokens.toLocaleString()}
                                    />
                                </StatGrid>
                            </MetricPanel>

                            <MetricPanel
                                title="By prompt version"
                                description="Compare two hashes of the same prompt to see if an edit helped. Quality outcomes are the rejections/floors that fired."
                            >
                                <DataTable
                                    rows={llm.versions}
                                    rowKey={(v) =>
                                        `${v.promptKey}|${v.model}|${v.promptVersionHash}`
                                    }
                                    empty="No telemetry yet — runs after the next analysis."
                                    columns={[
                                        {
                                            key: "promptKey",
                                            header: "Prompt",
                                            cell: (v) => (
                                                <span className="font-mono text-xs">
                                                    {v.promptKey}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "version",
                                            header: "Version",
                                            cell: (v) => (
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                    {v.promptVersionHash
                                                        ? v.promptVersionHash.slice(
                                                              0,
                                                              8,
                                                          )
                                                        : "—"}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "model",
                                            header: "Model",
                                            cell: (v) => (
                                                <span className="text-xs text-muted-foreground">
                                                    {v.model}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "calls",
                                            header: "Calls",
                                            cell: (v) => (
                                                <span className="tabular-nums">
                                                    {v.calls}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "fail",
                                            header: "Fails",
                                            cell: (v) => (
                                                <span className="tabular-nums">
                                                    {v.failures}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "cost",
                                            header: "Cost",
                                            cell: (v) => (
                                                <span className="tabular-nums">
                                                    {fmtUsd(v.costUsd)}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "p95",
                                            header: "p95",
                                            cell: (v) => (
                                                <span className="tabular-nums text-xs text-muted-foreground">
                                                    {fmtMs(v.p95Ms)}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "outcomes",
                                            header: "Quality outcomes",
                                            cell: (v) => (
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                    {topOutcomes(
                                                        v.qualityOutcomeCounts,
                                                    )}
                                                </span>
                                            ),
                                        },
                                    ]}
                                />
                            </MetricPanel>
                        </>
                    ) : null}

                    <MetricPanel
                        title="Coaching insight"
                        description="Captures that reached analysis — did the insight prompt produce a card, or null out?"
                    >
                        <StatGrid>
                            <StatCard
                                label="Analyzed"
                                value={data.analyzedWithAnalysis}
                                sub="captures with an analysis"
                            />
                            <StatCard
                                label="Insight present"
                                value={data.coachingInsightPresent}
                                sub={pct(
                                    data.coachingInsightPresent,
                                    data.analyzedWithAnalysis,
                                )}
                                tone="good"
                            />
                            <StatCard
                                label="Insight null"
                                value={data.coachingInsightNull}
                                sub={pct(
                                    data.coachingInsightNull,
                                    data.analyzedWithAnalysis,
                                )}
                                tone={
                                    data.analyzedWithAnalysis > 0 &&
                                    data.coachingInsightNull /
                                        data.analyzedWithAnalysis >
                                        0.5
                                        ? "warn"
                                        : "default"
                                }
                            />
                            <StatCard
                                label="Rejected captures"
                                value={data.rejectedTotal}
                                sub={`${data.rejectionBuckets.no_coachable_english} no-English · ${data.rejectionBuckets.other} other`}
                            />
                        </StatGrid>
                    </MetricPanel>

                    <MetricPanel
                        title="Capture pipeline status"
                        description="Where captures land in the upload → analyzed state machine."
                    >
                        <DistributionBars
                            rows={Object.entries(data.captureStatusCounts).map(
                                ([label, count]) => ({ label, count }),
                            )}
                            total={data.capturesScanned}
                        />
                    </MetricPanel>

                    <MetricPanel
                        title="Turn-rewrite verdicts"
                        description={`How the rewrite prompt judged each user turn (${data.turnRewritesTotal} turns).`}
                    >
                        <DistributionBars
                            rows={Object.entries(
                                data.turnRewriteVerdictCounts,
                            ).map(([label, count]) => ({ label, count }))}
                            total={data.turnRewritesTotal}
                        />
                    </MetricPanel>

                    <MetricPanel
                        title="Replay completion"
                        description="How replay drills resolved."
                    >
                        <DistributionBars
                            rows={Object.entries(
                                data.sessionCompletionCounts,
                            ).map(([label, count]) => ({ label, count }))}
                            total={data.sessionsScanned}
                        />
                    </MetricPanel>

                    {reactions ? (
                        <MetricPanel
                            title="User reactions"
                            description={`How users rated their coaching (${reactions.total} reactions).`}
                        >
                            <StatGrid>
                                <StatCard
                                    label="Helpful"
                                    value={reactions.up}
                                    sub={pct(reactions.up, reactions.total)}
                                    tone="good"
                                />
                                <StatCard
                                    label="Not helpful"
                                    value={reactions.down}
                                    sub={pct(reactions.down, reactions.total)}
                                    tone={
                                        reactions.total > 0 &&
                                        reactions.down / reactions.total > 0.4
                                            ? "bad"
                                            : "default"
                                    }
                                />
                            </StatGrid>
                            <DistributionBars
                                rows={Object.entries(
                                    reactions.reasonCodeCounts,
                                ).map(([label, count]) => ({ label, count }))}
                                emptyLabel="No reasons given yet."
                            />
                        </MetricPanel>
                    ) : null}

                    <MetricPanel
                        title="User-driven signals"
                        description="Transcript corrections (ASR mishearings users fixed) and echo-leak suppression."
                    >
                        <StatGrid>
                            <StatCard
                                label="Corrections"
                                value={data.correctionsTotal}
                                sub={`${data.capturesWithCorrections} captures touched`}
                            />
                            <StatCard
                                label="Vocab terms"
                                value={data.correctionsVocabularyTerms}
                                sub="fed to ASR keyterms"
                            />
                            <StatCard
                                label="Echo-leak dropped"
                                value={data.echoLeakSuppressedTotal}
                                sub={`${data.capturesWithEchoLeak} captures`}
                            />
                        </StatGrid>
                    </MetricPanel>
                </>
            )}
        </div>
    );
}
