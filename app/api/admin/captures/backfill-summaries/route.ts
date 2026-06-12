import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { generateMeetingSummary } from "@/lib/captures/meeting-summary";
import type { CaptureType } from "@/schemas";

export const runtime = "nodejs";

// Per-invocation bounds, sized to finish well inside the function timeout:
// the summary calls for one batch run concurrently, so wall time ≈ one call.
const DEFAULT_BATCH_LIMIT = 5;
const MAX_BATCH_LIMIT = 10;
const SCAN_LIMIT = 50;

/**
 * One-off backfill: generate `meetingSummary` for analyzed captures that
 * predate the feature (or whose generation failed). Idempotent — captures
 * that already have the field are skipped — and paginated: each call handles
 * one small batch and returns `nextCursor` (a capture doc ID); re-invoke with
 * it until it comes back null.
 *
 *   POST /api/admin/captures/backfill-summaries
 *   body (optional): { limit?: number, cursor?: string }
 *
 * Uses the same `(status, uploadedAt)` composite index as the processing
 * pipeline. Captures where generation legitimately produces nothing (e.g.
 * fully garbled transcripts) stay without the field and would be re-attempted
 * by a fresh run from the start — acceptable for a one-off tool.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    let limit = DEFAULT_BATCH_LIMIT;
    let cursor: string | null = null;
    try {
        const body = await request.json();
        if (Number.isInteger(body?.limit) && body.limit > 0) {
            limit = Math.min(body.limit, MAX_BATCH_LIMIT);
        }
        if (typeof body?.cursor === "string" && body.cursor) {
            cursor = body.cursor;
        }
    } catch {
        // No / invalid body — defaults are fine.
    }

    try {
        const db = getAdminFirestore();
        const capturesRef = db.collection(FirestoreCollections.captures.path);

        let query = capturesRef
            .where("status", "==", "analyzed")
            .orderBy("uploadedAt", "asc")
            .limit(SCAN_LIMIT);
        if (cursor) {
            const cursorSnap = await capturesRef.doc(cursor).get();
            if (!cursorSnap.exists) {
                return NextResponse.json(
                    { error: `Cursor capture not found: ${cursor}` },
                    { status: 400 },
                );
            }
            query = query.startAfter(cursorSnap);
        }

        const snap = await query.get();

        // Walk the scanned page in order, stopping once the batch is full so
        // the cursor never skips past unprocessed candidates.
        const toProcess: { id: string; capture: CaptureType }[] = [];
        let skipped = 0;
        let lastHandledId: string | null = null;
        let stoppedEarly = false;
        for (const doc of snap.docs) {
            const capture = doc.data() as CaptureType;
            const needsSummary =
                !capture.meetingSummary &&
                (capture.serverTranscript?.length ?? 0) > 0;
            if (!needsSummary) {
                skipped++;
                lastHandledId = doc.id;
                continue;
            }
            if (toProcess.length >= limit) {
                stoppedEarly = true;
                break;
            }
            toProcess.push({ id: doc.id, capture });
            lastHandledId = doc.id;
        }

        const results = await Promise.all(
            toProcess.map(async ({ id, capture }) => {
                try {
                    const meetingSummary = await generateMeetingSummary({
                        transcript: capture.serverTranscript ?? [],
                        durationSecs: capture.durationSecs ?? 0,
                    });
                    if (!meetingSummary) return { id, outcome: "empty" };
                    await capturesRef
                        .doc(id)
                        .set({ meetingSummary }, { merge: true });
                    return { id, outcome: "written" };
                } catch (err) {
                    console.warn(
                        `[admin/backfill-summaries] generation failed for ${id}`,
                        err,
                    );
                    return { id, outcome: "failed" };
                }
            }),
        );

        // More work may remain if the batch filled up before the page ran
        // out, or the page itself was full (more docs after it).
        const moreMayRemain =
            stoppedEarly || snap.docs.length === SCAN_LIMIT;

        return NextResponse.json({
            scanned: snap.docs.length,
            skipped,
            written: results.filter((r) => r.outcome === "written").length,
            empty: results.filter((r) => r.outcome === "empty").length,
            failed: results.filter((r) => r.outcome === "failed").length,
            nextCursor: moreMayRemain ? lastHandledId : null,
        });
    } catch (error) {
        console.error("[api/admin/captures/backfill-summaries] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Backfill batch failed.",
            },
            { status: 500 },
        );
    }
}
