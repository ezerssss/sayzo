import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

/**
 * Sessions are user-driven — the audio was uploaded by the user via
 * /api/sessions/complete and analysis ran inline. If processing failed,
 * resetting `processingStatus` to `idle` and `completionStatus` to
 * `needs_retry` puts the session back in a state where the user's UI
 * can re-trigger analysis (the existing analyzer pipeline runs).
 * We don't run the analyzer from here — it needs the audio bytes
 * supplied as multipart, and re-running from Storage would duplicate
 * the long-running pipeline outside the user-facing flow.
 */
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
            .collection(FirestoreCollections.sessions.path)
            .doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Session not found." },
                { status: 404 },
            );
        }
        const before = snap.data() as SessionType;

        await ref.set(
            {
                processingStatus: "idle",
                processingStage: null,
                processingError: null,
                processingUpdatedAt: new Date().toISOString(),
                completionStatus: "needs_retry",
            },
            { merge: true },
        );

        await writeAudit({
            actor: auth,
            action: "session.retry",
            targetId: id,
            targetUid: before.uid,
            before: {
                processingStatus: before.processingStatus ?? null,
                processingError: before.processingError ?? null,
                completionStatus: before.completionStatus,
            },
            after: {
                processingStatus: "idle",
                processingError: null,
                completionStatus: "needs_retry",
            },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[api/admin/sessions/${id}/retry] POST failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to retry session.",
            },
            { status: 500 },
        );
    }
}
