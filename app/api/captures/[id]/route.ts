import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import type { CaptureType } from "@/schemas";

export const runtime = "nodejs";

/**
 * Returns the latest title / summary for a capture so the desktop agent can
 * pick up the `serverTitle`/`serverSummary` that the post-transcription
 * quick-summary stage (and later the deep analysis stage) produces minutes
 * after upload. Same shape as the upload response, minus `capture_id` (the
 * agent already knows the id — it's in the URL), plus `coaching_insight`: a
 * single card-sized coaching takeaway (or `null`) projected from the persisted
 * analysis once `status === "analyzed"`, for the desktop agent's post-capture
 * card. It is `null` until then and is stable across repeated GETs.
 *
 * `meetingSummary` is intentionally NOT projected here — the agent has no
 * notes UI; the web reads the full doc via `useCapture`.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: captureId } = await params;

    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    try {
        const db = getAdminFirestore();
        const snap = await db
            .collection(FirestoreCollections.captures.path)
            .doc(captureId)
            .get();

        if (!snap.exists) {
            return NextResponse.json(
                { error: "Capture not found." },
                { status: 404 },
            );
        }

        const capture = snap.data() as CaptureType;
        if (capture.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to view this capture." },
                { status: 403 },
            );
        }

        return NextResponse.json({
            id: captureId,
            status: capture.status,
            title: capture.serverTitle ?? capture.title,
            summary: capture.serverSummary ?? capture.summary ?? "",
            coaching_insight:
                capture.status === "analyzed"
                    ? (capture.analysis?.coachingInsight ?? null)
                    : null,
        });
    } catch (error) {
        console.error(`[api/captures/${captureId}] GET failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load capture.",
            },
            { status: 500 },
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: captureId } = await params;

    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    try {
        const db = getAdminFirestore();
        const docRef = db
            .collection(FirestoreCollections.captures.path)
            .doc(captureId);
        const snap = await docRef.get();

        if (!snap.exists) {
            return NextResponse.json(
                { error: "Capture not found." },
                { status: 404 },
            );
        }

        const capture = snap.data() as CaptureType;
        if (capture.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to delete this capture." },
                { status: 403 },
            );
        }

        // Delete audio file from Cloud Storage
        const audioPath = capture.audioStoragePath?.trim();
        if (audioPath) {
            try {
                const bucket = getAdminStorageBucket();
                await bucket.file(audioPath).delete();
            } catch {
                // Audio file may already be deleted — continue
            }
        }

        await docRef.delete();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`[api/captures/${captureId}] DELETE failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to delete capture.",
            },
            { status: 500 },
        );
    }
}
