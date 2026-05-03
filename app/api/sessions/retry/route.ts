import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

/**
 * Sentinel completionReason written by this route. The feedback UI checks for
 * this exact string to swap the AI-driven retry banner for friendlier
 * "you chose to redo this" copy.
 */
export const VOLUNTARY_RETRY_REASON = "voluntary_retry";

type RetryPayload = { sessionId: string };

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let payload: RetryPayload;
    try {
        payload = (await request.json()) as RetryPayload;
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
        const sessionRef = db
            .collection(FirestoreCollections.sessions.path)
            .doc(sessionId);
        const snap = await sessionRef.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Session not found." },
                { status: 404 },
            );
        }

        const session = snap.data() as SessionType;
        if (session.uid !== uid) {
            return NextResponse.json(
                { error: "Unauthorized." },
                { status: 403 },
            );
        }

        if (session.processingStatus === "processing") {
            return NextResponse.json(
                {
                    error: "already_processing",
                    message: "Analysis is running for this drill.",
                },
                { status: 409 },
            );
        }

        // Voluntary retry only makes sense when the drill is in a terminal
        // analyzed state. needs_retry already shows the retry UI; pending
        // hasn't been recorded yet; skipped is dead.
        if (session.completionStatus !== "passed") {
            return NextResponse.json(
                {
                    error: "invalid_state",
                    message: `Cannot voluntarily retry a drill in status "${session.completionStatus}".`,
                },
                { status: 409 },
            );
        }

        // Flip to needs_retry. Keep audioObjectPath / transcript / analysis /
        // feedback in place — the user can still listen back and read the
        // prior feedback. The next /api/sessions/complete POST will reset
        // those fields in its transactional claim. Because audioObjectPath
        // is still set when that POST checks `isFirstRecordAttempt`, no
        // extra credit is charged for the redo.
        await sessionRef.set(
            {
                completionStatus: "needs_retry",
                completionReason: VOLUNTARY_RETRY_REASON,
            },
            { merge: true },
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[app/api/sessions/retry] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to retry drill.",
            },
            { status: 500 },
        );
    }
}
