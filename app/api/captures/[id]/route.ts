import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type { CaptureType } from "@/types/captures";

export const runtime = "nodejs";

export async function DELETE(
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
        console.error(
            `[api/captures/${captureId}] DELETE failed`,
            error,
        );
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
