import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

type DeletePayload = { sessionId: string };

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let payload: DeletePayload;
    try {
        payload = (await request.json()) as DeletePayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const sessionId = payload.sessionId?.trim();
    if (!sessionId) {
        return NextResponse.json(
            { error: "Missing sessionId." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const docRef = db
            .collection(FirestoreCollections.sessions.path)
            .doc(sessionId);
        const snap = await docRef.get();

        if (!snap.exists) {
            return NextResponse.json(
                { error: "Session not found." },
                { status: 404 },
            );
        }

        const session = snap.data() as SessionType;
        if (session.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to delete this session." },
                { status: 403 },
            );
        }

        // Delete stored audio file if it exists
        const audioPath = session.audioObjectPath?.trim();
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
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to delete session.",
            },
            { status: 500 },
        );
    }
}
