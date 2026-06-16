import { z } from "zod";

/**
 * An in-app alert raised when a monitored rate crosses its threshold. The MVP
 * notification channel (no email infra exists) — surfaced as a banner in the
 * admin shell. Content-free: metric key, scope, numbers, and status only.
 */

export const alertMetricKeySchema = z.enum([
    "failure_rate",
    "null_insight_rate",
    "generic_insight_rate",
    "fabrication_rate",
    "rejection_rate",
    "p95_latency",
    "cost_spike",
]);
export type AlertMetricKey = z.infer<typeof alertMetricKeySchema>;

export const alertStatusSchema = z.enum(["open", "acknowledged", "resolved"]);
export type AlertStatus = z.infer<typeof alertStatusSchema>;

export const adminAlertSchema = z.object({
    metricKey: alertMetricKeySchema,
    scope: z.object({
        promptKey: z.string().nullable(),
        model: z.string().nullable(),
    }),
    window: z.string(), // e.g. "24h"
    threshold: z.number(),
    observed: z.number(),
    /** Sample size behind `observed` — guards against alerting on 1-2 calls. */
    sampleSize: z.number().int().nonnegative(),
    status: alertStatusSchema,
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    /** Admin note added on acknowledge/resolve. */
    note: z.string().nullable(),
});
export type AdminAlert = z.infer<typeof adminAlertSchema>;

/** One live alert per (metricKey, promptKey) so re-evaluation updates in place. */
export function adminAlertDocId(
    metricKey: AlertMetricKey,
    promptKey: string | null,
): string {
    return `${metricKey}__${promptKey ?? "all"}`;
}
