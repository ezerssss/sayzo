import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { CaptureType } from "@/types/captures";

export const runtime = "nodejs";

/**
 * DEV ONLY — reset a capture back to "queued" so the pipeline re-processes it.
 * Remove this endpoint before shipping to production.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: captureId } = await params;

    let payload: { uid: string };
    try {
        payload = (await request.json()) as { uid: string };
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const uid = payload.uid?.trim();
    if (!uid) {
        return NextResponse.json(
            { error: "Missing uid." },
            { status: 400 },
        );
    }

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
                { error: "Not authorized." },
                { status: 403 },
            );
        }

        // Reset to queued — clear all processed data
        await docRef.set(
            {
                status: "queued",
                error: null,
                retryCount: 0,
                rejectionReason: null,
                serverTranscript: null,
                serverTitle: null,
                serverSummary: null,
                durationSecs: null,
                humeExpression: null,
                analysis: null,
            },
            { merge: true },
        );

        return NextResponse.json({ success: true, status: "queued" });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to reset capture.",
            },
            { status: 500 },
        );
    }
}
