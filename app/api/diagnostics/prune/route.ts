import { pruneExpiredDiagnosticLogs } from "@/lib/diagnostics/retention";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Retention sweep for diagnostic logs — deletes rows + storage blobs older than
 * the retention window (DIAGNOSTICS_RETENTION_DAYS, default 30d). CRON_SECRET-
 * guarded, same as /api/captures/process; driven by the slow tick in
 * instrumentation.ts.
 */
export async function POST(request: NextRequest) {
    const authHeader = request.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET?.trim();

    if (!cronSecret) {
        console.error("[api/diagnostics/prune] CRON_SECRET is not configured");
        return NextResponse.json(
            { error: "Server misconfiguration" },
            { status: 500 },
        );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await pruneExpiredDiagnosticLogs();
        return NextResponse.json(result);
    } catch (error) {
        console.error("[api/diagnostics/prune] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Prune failed",
            },
            { status: 500 },
        );
    }
}
