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
}
