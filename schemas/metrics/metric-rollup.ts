import { z } from "zod";

import {
    llmErrorClassSchema,
    llmPromptKeySchema,
    llmQualityOutcomeSchema,
} from "./llm-event";

/**
 * Daily pre-aggregated counters over `llm_events`, keyed by
 * `day × promptKey × model × promptVersionHash`. Powers cheap dashboards and
 * alert evaluation without re-scanning raw events. Keyed BY VERSION so
 * "did my prompt edit help" survives from rollups.
 *
 * No stored percentiles — you can't average p95 across rollups; the latency
 * histogram serves long-range trend, and exact percentiles are computed on-read
 * from raw events over a bounded window. Content-free, same as `llm_events`.
 *
 * Doc id: `${day}__${promptKey}__${model}__${promptVersionHash}`.
 */
export const metricRollupSchema = z.object({
    day: z.string(), // YYYY-MM-DD (UTC)
    promptKey: llmPromptKeySchema,
    model: z.string(),
    promptVersionHash: z.string(),
    calls: z.number().int().nonnegative(),
    successes: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    errorClassCounts: z.record(llmErrorClassSchema, z.number().int()),
    qualityOutcomeCounts: z.record(llmQualityOutcomeSchema, z.number().int()),
    inputTokensSum: z.number().nonnegative(),
    outputTokensSum: z.number().nonnegative(),
    costUsdSum: z.number().nonnegative(),
    /** Bucket label → count (labels match lib/admin/metrics-l1 latency buckets). */
    latencyHistogram: z.record(z.string(), z.number().int()),
    updatedAt: z.string(),
});
export type MetricRollup = z.infer<typeof metricRollupSchema>;

export function metricRollupDocId(
    day: string,
    promptKey: string,
    model: string,
    promptVersionHash: string,
): string {
    return `${day}__${promptKey}__${model}__${promptVersionHash}`;
}
