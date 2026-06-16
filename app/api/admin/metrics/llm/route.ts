import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveWindow } from "@/lib/admin/metrics-l1";
import {
    aggregateLlmEvents,
    fetchLlmEventsInWindow,
} from "@/lib/admin/metrics-events";

export const runtime = "nodejs";

const INDEX_HINT =
    "The llm_events query needs a Firestore index on createdAt. Check the server logs for the index-creation link.";
const TRUNCATION_HINT =
    "Hit the per-query scan cap — telemetry is computed on the most recent slice only. Narrow the window for exact numbers.";

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const params = new URL(request.url).searchParams;
        const window = resolveWindow(params.get("from"), params.get("to"));

        const events = await fetchLlmEventsInWindow(window);

        return NextResponse.json({
            window,
            data: aggregateLlmEvents(events.rows),
            indexHint: events.indexError
                ? INDEX_HINT
                : events.truncated
                  ? TRUNCATION_HINT
                  : undefined,
        });
    } catch (error) {
        console.error("[api/admin/metrics/llm] GET failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load LLM telemetry.",
            },
            { status: 500 },
        );
    }
}
