import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type { CaptureType } from "@/types/captures";

export const runtime = "nodejs";

const URL_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

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
        const captureSnap = await db
            .collection(FirestoreCollections.captures.path)
            .doc(captureId)
            .get();

        if (!captureSnap.exists) {
            return NextResponse.json(
                { error: "Capture not found." },
                { status: 404 },
            );
        }

        const capture = captureSnap.data() as CaptureType;

        if (capture.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to access this capture." },
                { status: 403 },
            );
        }

        if (!capture.audioStoragePath) {
            return NextResponse.json(
                { error: "No audio file available for this capture." },
                { status: 404 },
            );
        }

        const bucket = getAdminStorageBucket();
        const file = bucket.file(capture.audioStoragePath);

        const expiresAt = Date.now() + URL_EXPIRATION_MS;
        const [url] = await file.getSignedUrl({
            action: "read",
            expires: expiresAt,
        });

        return NextResponse.json({ url, expiresAt });
    } catch (error) {
        console.error(
            `[api/captures/${captureId}/audio-url] GET failed`,
            error,
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to generate audio URL.",
            },
            { status: 500 },
        );
    }
}
