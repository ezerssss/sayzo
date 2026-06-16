import "server-only";

import { FirestoreCollections } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { LlmEvent } from "@/schemas";
import type { MetricsWindow } from "./metrics-l1";

/**
 * Layer-3 aggregation over the raw `llm_events` store: cost, tokens, latency
 * percentiles, error classes, and quality outcomes — grouped by prompt and by
 * prompt VERSION so admins can compare two `promptVersionHash` rows ("did my
 * edit help?"). Content-free in, content-free out.
 */

const SCAN_CAP = 5000;

type Scan<T> = { rows: T[]; indexError: boolean; truncated: boolean };

export async function fetchLlmEventsInWindow(
    window: MetricsWindow,
): Promise<Scan<LlmEvent>> {
    const db = getAdminFirestore();
    try {
        const snap = await db
            .collection(FirestoreCollections.llmEvents.path)
            .where("createdAt", ">=", window.fromIso)
            .where("createdAt", "<=", window.toIso)
            .orderBy("createdAt", "desc")
            .limit(SCAN_CAP)
            .get();
        return {
            rows: snap.docs.map((d) => d.data() as LlmEvent),
            indexError: false,
            truncated: snap.docs.length >= SCAN_CAP,
        };
    } catch (error) {
        console.warn(
            "[metrics-events] llm_events window query failed (likely missing index)",
            error,
        );
        return { rows: [], indexError: true, truncated: false };
    }
}

function percentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
    return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))];
}

export type PromptKeySummary = {
    promptKey: string;
    calls: number;
    failures: number;
    costUsd: number;
    p50Ms: number;
    p95Ms: number;
};

export type VersionRow = {
    promptKey: string;
    model: string;
    promptVersionHash: string;
    calls: number;
    failures: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    p50Ms: number;
    p95Ms: number;
    qualityOutcomeCounts: Record<string, number>;
    errorClassCounts: Record<string, number>;
};

export type LlmEventsAggregate = {
    eventsScanned: number;
    totalCalls: number;
    totalFailures: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    byPromptKey: PromptKeySummary[];
    versions: VersionRow[];
};

type Bucket = {
    promptKey: string;
    model: string;
    promptVersionHash: string;
    latencies: number[];
    failures: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    qualityOutcomeCounts: Record<string, number>;
    errorClassCounts: Record<string, number>;
};

export function aggregateLlmEvents(events: LlmEvent[]): LlmEventsAggregate {
    const versionBuckets = new Map<string, Bucket>();
    const keyLatencies = new Map<string, number[]>();
    const keyTotals = new Map<
        string,
        { calls: number; failures: number; costUsd: number }
    >();

    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalFailures = 0;

    for (const e of events) {
        const vKey = `${e.promptKey}|${e.model}|${e.promptVersionHash}`;
        let bucket = versionBuckets.get(vKey);
        if (!bucket) {
            bucket = {
                promptKey: e.promptKey,
                model: e.model,
                promptVersionHash: e.promptVersionHash,
                latencies: [],
                failures: 0,
                costUsd: 0,
                inputTokens: 0,
                outputTokens: 0,
                qualityOutcomeCounts: {},
                errorClassCounts: {},
            };
            versionBuckets.set(vKey, bucket);
        }

        bucket.latencies.push(e.latencyMs);
        bucket.costUsd += e.costUsd ?? 0;
        bucket.inputTokens += e.inputTokens ?? 0;
        bucket.outputTokens += e.outputTokens ?? 0;
        if (!e.success) bucket.failures += 1;
        if (e.errorClass) {
            bucket.errorClassCounts[e.errorClass] =
                (bucket.errorClassCounts[e.errorClass] ?? 0) + 1;
        }
        for (const o of e.qualityOutcomes ?? []) {
            bucket.qualityOutcomeCounts[o] =
                (bucket.qualityOutcomeCounts[o] ?? 0) + 1;
        }

        totalCostUsd += e.costUsd ?? 0;
        totalInputTokens += e.inputTokens ?? 0;
        totalOutputTokens += e.outputTokens ?? 0;
        if (!e.success) totalFailures += 1;

        const lat = keyLatencies.get(e.promptKey) ?? [];
        lat.push(e.latencyMs);
        keyLatencies.set(e.promptKey, lat);
        const kt = keyTotals.get(e.promptKey) ?? {
            calls: 0,
            failures: 0,
            costUsd: 0,
        };
        kt.calls += 1;
        if (!e.success) kt.failures += 1;
        kt.costUsd += e.costUsd ?? 0;
        keyTotals.set(e.promptKey, kt);
    }

    const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

    const versions: VersionRow[] = [...versionBuckets.values()]
        .map((b) => {
            const sorted = [...b.latencies].sort((a, c) => a - c);
            return {
                promptKey: b.promptKey,
                model: b.model,
                promptVersionHash: b.promptVersionHash,
                calls: b.latencies.length,
                failures: b.failures,
                costUsd: round(b.costUsd),
                inputTokens: b.inputTokens,
                outputTokens: b.outputTokens,
                p50Ms: percentile(sorted, 50),
                p95Ms: percentile(sorted, 95),
                qualityOutcomeCounts: b.qualityOutcomeCounts,
                errorClassCounts: b.errorClassCounts,
            };
        })
        .sort((a, b) => b.calls - a.calls);

    const byPromptKey: PromptKeySummary[] = [...keyTotals.entries()]
        .map(([promptKey, t]) => {
            const sorted = [...(keyLatencies.get(promptKey) ?? [])].sort(
                (a, c) => a - c,
            );
            return {
                promptKey,
                calls: t.calls,
                failures: t.failures,
                costUsd: round(t.costUsd),
                p50Ms: percentile(sorted, 50),
                p95Ms: percentile(sorted, 95),
            };
        })
        .sort((a, b) => b.costUsd - a.costUsd);

    return {
        eventsScanned: events.length,
        totalCalls: events.length,
        totalFailures,
        totalCostUsd: round(totalCostUsd),
        totalInputTokens,
        totalOutputTokens,
        byPromptKey,
        versions,
    };
}
