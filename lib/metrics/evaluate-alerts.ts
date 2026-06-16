import "server-only";

import { FirestoreCollections, adminAlertDocId } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { AdminAlert, AlertMetricKey, LlmEvent } from "@/schemas";

/**
 * Evaluate monitored rates over the last 24h of `llm_events` and reconcile the
 * `admin_alerts` collection: raise/refresh an alert when a rate is over
 * threshold (with a minimum sample size), resolve it when it recovers. One live
 * doc per (metricKey, promptKey). Runs inside the rollup cron.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW = "24h";
const MIN_SAMPLE = 10;
const SCAN_CAP = 20000;

type PerKey = {
    calls: number;
    failures: number;
    outcomes: Record<string, number>;
};

type Candidate = {
    metricKey: AlertMetricKey;
    promptKey: string;
    threshold: number;
    observed: number;
    sampleSize: number;
};

function rate(part: number, whole: number): number {
    return whole > 0 ? part / whole : 0;
}

/** Definitions of which rate to watch, scoped to a prompt key. */
function buildCandidates(byKey: Map<string, PerKey>): Candidate[] {
    const out: Candidate[] = [];

    for (const [promptKey, k] of byKey) {
        if (k.calls < MIN_SAMPLE) continue;

        // Failure rate applies to every prompt.
        out.push({
            metricKey: "failure_rate",
            promptKey,
            threshold: 0.15,
            observed: rate(k.failures, k.calls),
            sampleSize: k.calls,
        });

        if (promptKey === "capture.deep_analysis") {
            out.push({
                metricKey: "null_insight_rate",
                promptKey,
                threshold: 0.6,
                observed: rate(k.outcomes.INSIGHT_NULL ?? 0, k.calls),
                sampleSize: k.calls,
            });
            out.push({
                metricKey: "generic_insight_rate",
                promptKey,
                threshold: 0.2,
                observed: rate(k.outcomes.GENERIC_INSIGHT ?? 0, k.calls),
                sampleSize: k.calls,
            });
            const fabrications =
                (k.outcomes.FABRICATED_INSIGHT_BODY ?? 0) +
                (k.outcomes.FABRICATED_TURN_REWRITE ?? 0) +
                (k.outcomes.FABRICATED_BETTER_OPTION ?? 0);
            out.push({
                metricKey: "fabrication_rate",
                promptKey,
                threshold: 0.15,
                observed: rate(fabrications, k.calls),
                sampleSize: k.calls,
            });
        }

        if (promptKey === "capture.validate") {
            const rejections =
                (k.outcomes.REJECTED_NOT_RELEVANT ?? 0) +
                (k.outcomes.REJECTED_NOT_ORGANIC ?? 0) +
                (k.outcomes.REJECTED_NO_SUBSTANCE ?? 0) +
                (k.outcomes.REJECTED_NO_COACHABLE_ENGLISH ?? 0);
            out.push({
                metricKey: "rejection_rate",
                promptKey,
                threshold: 0.5,
                observed: rate(rejections, k.calls),
                sampleSize: k.calls,
            });
        }
    }

    return out;
}

export async function evaluateAlerts(): Promise<{
    raised: number;
    resolved: number;
}> {
    const db = getAdminFirestore();
    const fromIso = new Date(Date.now() - DAY_MS).toISOString();

    const snap = await db
        .collection(FirestoreCollections.llmEvents.path)
        .where("createdAt", ">=", fromIso)
        .orderBy("createdAt", "desc")
        .limit(SCAN_CAP)
        .get();
    const events = snap.docs.map((d) => d.data() as LlmEvent);

    const byKey = new Map<string, PerKey>();
    for (const e of events) {
        let k = byKey.get(e.promptKey);
        if (!k) {
            k = { calls: 0, failures: 0, outcomes: {} };
            byKey.set(e.promptKey, k);
        }
        k.calls += 1;
        if (!e.success) k.failures += 1;
        for (const o of e.qualityOutcomes ?? []) {
            k.outcomes[o] = (k.outcomes[o] ?? 0) + 1;
        }
    }

    const candidates = buildCandidates(byKey);
    const breached = new Map<string, Candidate>();
    for (const c of candidates) {
        if (c.observed > c.threshold) {
            breached.set(adminAlertDocId(c.metricKey, c.promptKey), c);
        }
    }

    // Reconcile against existing alerts.
    const existingSnap = await db
        .collection(FirestoreCollections.adminAlerts.path)
        .get();
    const existing = new Map<string, AdminAlert>();
    for (const d of existingSnap.docs) {
        existing.set(d.id, d.data() as AdminAlert);
    }

    const now = new Date().toISOString();
    const alertsCol = db.collection(FirestoreCollections.adminAlerts.path);
    let raised = 0;
    let resolved = 0;
    const writes: Promise<unknown>[] = [];

    // Raise / refresh breached metrics.
    for (const [id, c] of breached) {
        const prior = existing.get(id);
        const round = (n: number) => Math.round(n * 10000) / 10000;
        const doc: AdminAlert = {
            metricKey: c.metricKey,
            scope: { promptKey: c.promptKey, model: null },
            window: WINDOW,
            threshold: c.threshold,
            observed: round(c.observed),
            sampleSize: c.sampleSize,
            // Keep an admin's acknowledgement sticky; otherwise it's open.
            status: prior?.status === "acknowledged" ? "acknowledged" : "open",
            firstSeenAt:
                prior && prior.status !== "resolved" ? prior.firstSeenAt : now,
            lastSeenAt: now,
            note: prior?.note ?? null,
        };
        if (!prior || prior.status === "resolved") raised += 1;
        writes.push(alertsCol.doc(id).set(doc));
    }

    // Resolve alerts that are no longer breached.
    for (const [id, prior] of existing) {
        if (breached.has(id)) continue;
        if (prior.status === "resolved") continue;
        resolved += 1;
        writes.push(
            alertsCol
                .doc(id)
                .set({ status: "resolved", lastSeenAt: now }, { merge: true }),
        );
    }

    await Promise.all(writes);
    return { raised, resolved };
}
