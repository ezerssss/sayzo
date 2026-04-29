import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { processNextCapture } from "@/lib/captures/process";
import type { CaptureStatus, CaptureType } from "@/types/captures";

export const runtime = "nodejs";

/**
 * Reset retryCount + clear error on a failed capture so it becomes eligible for
 * the next `processNextCapture()` pass. The capture's status is left alone —
 * the existing dispatcher already routes failed statuses to the right
 * stage (`transcribe_failed` → transcription, `analyze_failed` → analysis,
 * etc., see `lib/captures/process.ts`). We then attempt one immediate process
 * pass so the admin sees something happen; the cron poller picks up anything
 * we don't drain in this request.
 */
const FAILED_STATUSES: CaptureStatus[] = [
    "transcribe_failed",
    "validate_failed",
    "analyze_failed",
    "profile_failed",
];

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const db = getAdminFirestore();
        const ref = db
            .collection(FirestoreCollections.captures.path)
            .doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Capture not found." },
                { status: 404 },
            );
        }
        const capture = snap.data() as CaptureType;
        if (!FAILED_STATUSES.includes(capture.status)) {
            return NextResponse.json(
                {
                    error: `Capture is not in a failed state (current: ${capture.status}).`,
                },
                { status: 409 },
            );
        }

        await ref.set(
            { retryCount: 0, error: null },
            { merge: true },
        );

        // Best-effort immediate process. If it picks a different capture
        // (this isn't necessarily the oldest), the next cron tick will
        // re-attempt this one.
        let processed: Awaited<ReturnType<typeof processNextCapture>> = null;
        try {
            processed = await processNextCapture();
        } catch (error) {
            console.warn(
                `[api/admin/captures/${id}/retry] processNextCapture failed`,
                error,
            );
        }

        await writeAudit({
            actor: auth,
            action: "capture.retry",
            targetId: id,
            targetUid: capture.uid,
            before: {
                status: capture.status,
                retryCount: capture.retryCount ?? 0,
                error: capture.error ?? null,
            },
            after: {
                status: processed?.captureId === id ? processed.newStatus : capture.status,
                retryCount: 0,
                error: null,
            },
            metadata: processed
                ? {
                      processedCaptureId: processed.captureId,
                      processedNewStatus: processed.newStatus,
                  }
                : { processedCaptureId: null },
        });

        return NextResponse.json({ ok: true, processed });
    } catch (error) {
        console.error(`[api/admin/captures/${id}/retry] POST failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to retry capture.",
            },
            { status: 500 },
        );
    }
}
