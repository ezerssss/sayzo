/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * Sets up a polling loop that processes queued captures every 2 minutes
 * by hitting the local `/api/captures/process` endpoint via fetch.
 *
 * Uses fetch instead of importing `processNextCapture` directly because
 * `instrumentation.ts` is bundled for both Node.js and Edge runtimes —
 * importing server-only modules (node:fs, node:child_process, etc.) would
 * break the Edge bundle even behind a runtime guard.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
    const port = process.env.PORT || 3000;
    const cronSecret = process.env.CRON_SECRET?.trim() || "";

    async function tick() {
        try {
            const res = await fetch(
                `http://localhost:${port}/api/captures/process`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${cronSecret}` },
                },
            );

            const data = (await res.json()) as {
                captureId?: string;
                previousStatus?: string;
                newStatus?: string;
                error?: string;
                message?: string;
            };

            if (data.captureId) {
                console.log(
                    `[captures/cron] Processed ${data.captureId}: ${data.previousStatus} → ${data.newStatus}`,
                );

                // If we processed something, immediately check for more
                // rather than waiting for the next interval. This drains the
                // queue faster when multiple captures are queued.
                void tick();
                return;
            }
        } catch {
            // Server might not be ready yet on first tick — silently retry
            // on the next interval.
        }
    }

    setInterval(() => void tick(), POLL_INTERVAL_MS);

    console.log(
        `[captures/cron] Polling loop registered — every ${POLL_INTERVAL_MS / 1000}s`,
    );

    // Diagnostics retention sweep — far slower than the capture poll. Deletes
    // log rows + blobs past the retention window (DIAGNOSTICS_RETENTION_DAYS).
    // Runs shortly after startup, then every 6h.
    const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
    const PRUNE_STARTUP_DELAY_MS = 5 * 60 * 1000; // 5 min after boot

    async function prune() {
        try {
            const res = await fetch(
                `http://localhost:${port}/api/diagnostics/prune`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${cronSecret}` },
                },
            );
            const data = (await res.json()) as {
                docsDeleted?: number;
                blobsDeleted?: number;
                error?: string;
            };
            if (data.docsDeleted) {
                console.log(
                    `[diagnostics/cron] Pruned ${data.docsDeleted} log(s), ${data.blobsDeleted ?? 0} blob(s)`,
                );
            }
        } catch {
            // Server may not be ready yet — retry on the next interval.
        }
    }

    setTimeout(() => void prune(), PRUNE_STARTUP_DELAY_MS);
    setInterval(() => void prune(), PRUNE_INTERVAL_MS);

    console.log(
        `[diagnostics/cron] Retention sweep registered — every ${PRUNE_INTERVAL_MS / 1000 / 3600}h`,
    );

    // Metrics rollup + alert evaluation — rolls llm_events into metric_rollups
    // and raises/resolves admin_alerts. Idempotent (writes by deterministic doc
    // id + reconciles), so duplicate ticks across restarts/workers are safe.
    const ROLLUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
    const ROLLUP_STARTUP_DELAY_MS = 5 * 60 * 1000; // 5 min after boot

    async function rollup() {
        try {
            const res = await fetch(
                `http://localhost:${port}/api/metrics/rollup`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${cronSecret}` },
                },
            );
            const data = (await res.json()) as {
                rollup?: { rollupsWritten?: number };
                alerts?: { raised?: number; resolved?: number };
                error?: string;
            };
            if (data.rollup || data.alerts) {
                console.log(
                    `[metrics/cron] Rolled ${data.rollup?.rollupsWritten ?? 0} bucket(s); alerts +${data.alerts?.raised ?? 0}/-${data.alerts?.resolved ?? 0}`,
                );
            }
        } catch {
            // Server may not be ready yet — retry on the next interval.
        }
    }

    setTimeout(() => void rollup(), ROLLUP_STARTUP_DELAY_MS);
    setInterval(() => void rollup(), ROLLUP_INTERVAL_MS);

    console.log(
        `[metrics/cron] Rollup + alerts registered — every ${ROLLUP_INTERVAL_MS / 1000 / 3600}h`,
    );
}
