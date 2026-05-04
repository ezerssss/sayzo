import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

/**
 * Heartbeat written by the drill page (mount + 5-min interval + visibility
 * change). Pre-gen with `dailyRefresh: true` reads `viewedAt` and skips
 * mutate-in-place when it's fresh, so a user reading the brief never sees
 * the prompt change underneath them.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: sessionId } = await params;

    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    if (!sessionId) {
        return NextResponse.json(
            { error: "Missing sessionId." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const ref = db
            .collection(FirestoreCollections.sessions.path)
            .doc(sessionId);
        const snap = await ref.get();

        if (!snap.exists) {
            return NextResponse.json(
                { error: "Session not found." },
                { status: 404 },
            );
        }

        const session = snap.data() as SessionType;
        if (session.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to view this session." },
                { status: 403 },
            );
        }

        await ref.set(
            { viewedAt: new Date().toISOString() },
            { merge: true },
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[api/sessions/${sessionId}/viewed] POST failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to record view.",
            },
            { status: 500 },
        );
    }
}
