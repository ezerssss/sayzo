import { NextResponse, type NextRequest } from "next/server";

import { evaluateAlerts } from "@/lib/metrics/evaluate-alerts";
import { runDailyRollup } from "@/lib/metrics/rollup";

export const runtime = "nodejs";

/**
 * Daily metrics rollup + alert evaluation. CRON_SECRET-gated, mirroring
 * /api/captures/process — register this in the SAME external scheduler that
 * pings the capture cron (there is no vercel.json cron). Idempotent: re-running
 * recomputes the same rollup doc ids and reconciles alerts.
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET?.trim();

    if (!cronSecret) {
        console.error("[api/metrics/rollup] CRON_SECRET is not configured");
        return NextResponse.json(
            { error: "Server misconfiguration" },
            { status: 500 },
        );
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const rollup = await runDailyRollup();
        const alerts = await evaluateAlerts();
        return NextResponse.json({ rollup, alerts });
    } catch (error) {
        console.error("[api/metrics/rollup] POST failed", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Rollup failed",
            },
            { status: 500 },
        );
    }
}
