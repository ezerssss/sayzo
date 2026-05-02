import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import type { CaptureType } from "@/types/captures";

export const runtime = "nodejs";

/**
 * Returns the latest title / summary / relevant_span for a capture so the
 * desktop agent can pick up the better `serverTitle`/`serverSummary` that
 * the deep analysis stage produces minutes after upload. Same shape as the
 * upload response, minus `capture_id` (the agent already knows the id —
 * it's in the URL).
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
            relevant_span: capture.relevantSpan,
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
