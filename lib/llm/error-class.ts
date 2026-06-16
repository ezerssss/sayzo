import type { LlmErrorClass } from "@/schemas";

/**
 * Map a thrown error to a bounded `LlmErrorClass`. Reads the message ONLY to
 * classify — the returned value is an enum, never the message itself, so no
 * model-echoed input can leak into the telemetry store.
 */
export function classifyError(err: unknown): LlmErrorClass {
    const message = (
        err instanceof Error ? err.message : String(err ?? "")
    ).toLowerCase();
    const status = extractStatus(err);

    if (status === 429 || /rate.?limit|too many requests|quota/.test(message)) {
        return "rate_limit";
    }
    if (status !== null && status >= 500) return "provider_5xx";
    if (status !== null && status >= 400) return "provider_4xx";
    if (/timeout|timed out|etimedout|deadline|aborted/.test(message)) {
        return "timeout";
    }
    if (
        /zod|schema|could not parse|no object generated|invalid json|validation/.test(
            message,
        )
    ) {
        return "schema_parse";
    }
    if (/econnreset|enotfound|network|fetch failed|socket|dns/.test(message)) {
        return "network";
    }
    return "unknown";
}

function extractStatus(err: unknown): number | null {
    if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        const candidates = [
            e.statusCode,
            e.status,
            (e.response as Record<string, unknown> | undefined)?.status,
        ];
        for (const c of candidates) {
            if (typeof c === "number") return c;
        }
    }
    return null;
}
