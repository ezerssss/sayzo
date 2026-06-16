import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
    aggregateQuality,
    aggregateReactions,
    fetchCapturesInWindow,
    fetchReactionsInWindow,
    fetchSessionsInWindow,
    resolveWindow,
} from "@/lib/admin/metrics-l1";

export const runtime = "nodejs";

const INDEX_HINT =
    "A metrics query needed a Firestore composite/single-field index. Check the server logs for the index-creation link.";
const TRUNCATION_HINT =
    "Hit the per-query scan cap — rates are computed on the most recent slice only. Narrow the window for exact numbers.";

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const params = new URL(request.url).searchParams;
        const window = resolveWindow(params.get("from"), params.get("to"));

        const [captures, sessions, reactions] = await Promise.all([
            fetchCapturesInWindow(window),
            fetchSessionsInWindow(window),
            fetchReactionsInWindow(window),
        ]);

        return NextResponse.json({
            window,
            data: aggregateQuality(captures.rows, sessions.rows),
            reactions: aggregateReactions(reactions.rows),
            indexHint:
                captures.indexError ||
                sessions.indexError ||
                reactions.indexError
                    ? INDEX_HINT
                    : captures.truncated ||
                        sessions.truncated ||
                        reactions.truncated
                      ? TRUNCATION_HINT
                      : undefined,
        });
    } catch (error) {
        console.error("[api/admin/metrics/quality-l1] GET failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load prompt-health metrics.",
            },
            { status: 500 },
        );
    }
}
