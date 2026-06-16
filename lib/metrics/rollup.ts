import "server-only";

import { FirestoreCollections, metricRollupDocId } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { LlmEvent } from "@/schemas";

/**
 * Roll raw `llm_events` into daily `metric_rollups` counters keyed by
 * `day × promptKey × model × promptVersionHash`. A full recompute per day is
 * idempotent — re-running the same window overwrites the same doc ids, so it
 * never double-counts. Cheap dashboards + alert evaluation read these.
 */

const SCAN_CAP = 20000;
const DAY_MS = 24 * 60 * 60 * 1000;

const LATENCY_BUCKETS_MS: Array<{ label: string; max: number }> = [
    { label: "<500ms", max: 500 },
    { label: "0.5-1s", max: 1000 },
    { label: "1-3s", max: 3000 },
    { label: "3-10s", max: 10000 },
    { label: "10-30s", max: 30000 },
    { label: "30s+", max: Infinity },
];

type RollupAcc = {
    day: string;
    promptKey: string;
    model: string;
    promptVersionHash: string;
    calls: number;
    successes: number;
    failures: number;
    errorClassCounts: Record<string, number>;
    qualityOutcomeCounts: Record<string, number>;
    inputTokensSum: number;
    outputTokensSum: number;
    costUsdSum: number;
    latencyHistogram: Record<string, number>;
};

export async function runDailyRollup(opts?: {
    days?: number;
}): Promise<{ rollupsWritten: number; eventsScanned: number }> {
    const days = opts?.days ?? 2; // re-roll the last 2 days to catch late writes
    const db = getAdminFirestore();
    const fromIso = new Date(Date.now() - days * DAY_MS).toISOString();

    const snap = await db
        .collection(FirestoreCollections.llmEvents.path)
        .where("createdAt", ">=", fromIso)
        .orderBy("createdAt", "desc")
        .limit(SCAN_CAP)
        .get();
    const events = snap.docs.map((d) => d.data() as LlmEvent);

    const buckets = new Map<string, RollupAcc>();
    for (const e of events) {
        const day = e.createdAt.slice(0, 10);
        const id = metricRollupDocId(
            day,
            e.promptKey,
            e.model,
            e.promptVersionHash,
        );
        let r = buckets.get(id);
        if (!r) {
            r = {
                day,
                promptKey: e.promptKey,
                model: e.model,
                promptVersionHash: e.promptVersionHash,
                calls: 0,
                successes: 0,
                failures: 0,
                errorClassCounts: {},
                qualityOutcomeCounts: {},
                inputTokensSum: 0,
                outputTokensSum: 0,
                costUsdSum: 0,
                latencyHistogram: Object.fromEntries(
                    LATENCY_BUCKETS_MS.map((b) => [b.label, 0]),
                ),
            };
            buckets.set(id, r);
        }
        r.calls += 1;
        if (e.success) r.successes += 1;
        else r.failures += 1;
        if (e.errorClass) {
            r.errorClassCounts[e.errorClass] =
                (r.errorClassCounts[e.errorClass] ?? 0) + 1;
        }
        for (const o of e.qualityOutcomes ?? []) {
            r.qualityOutcomeCounts[o] = (r.qualityOutcomeCounts[o] ?? 0) + 1;
        }
        r.inputTokensSum += e.inputTokens ?? 0;
        r.outputTokensSum += e.outputTokens ?? 0;
        r.costUsdSum += e.costUsd ?? 0;
        const bucket = LATENCY_BUCKETS_MS.find((b) => e.latencyMs < b.max);
        if (bucket) r.latencyHistogram[bucket.label] += 1;
    }

    const now = new Date().toISOString();
    await Promise.all(
        [...buckets.entries()].map(([id, r]) =>
            db
                .collection(FirestoreCollections.metricRollups.path)
                .doc(id)
                .set({ ...r, updatedAt: now }),
        ),
    );

    return { rollupsWritten: buckets.size, eventsScanned: events.length };
}
