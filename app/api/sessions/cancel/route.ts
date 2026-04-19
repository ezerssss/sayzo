import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { isStaleProcessing } from "@/constants/session-processing";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

type CancelPayload = { uid: string; sessionId: string };

export async function POST(request: NextRequest) {
    let payload: CancelPayload;
    try {
        payload = (await request.json()) as CancelPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const uid = payload.uid?.trim();
    const sessionId = payload.sessionId?.trim();
    if (!uid || !sessionId) {
        return NextResponse.json(
            { error: "Missing uid or sessionId." },
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

        if (session.processingStatus !== "processing") {
            return NextResponse.json({
                ok: true,
                alreadySettled: true,
                processingStatus: session.processingStatus ?? "idle",
            });
        }

        // Guard against cancelling a backend that is still alive. The
        // complete handler refreshes processingUpdatedAt at every stage,
        // so a recent timestamp means it's working, not stuck.
        if (!isStaleProcessing(session.processingUpdatedAt)) {
            return NextResponse.json(
                {
                    error:
                        "Analysis is still running. Wait a moment before cancelling.",
                    code: "PROCESSING_NOT_STALE",
                },
                { status: 409 },
            );
        }

        await sessionRef.set(
            {
                processingStatus: "failed",
                processingStage: null,
                processingJobId: null,
                processingError:
                    "Processing was cancelled after it appeared stuck.",
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[app/api/sessions/cancel] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to cancel drill.",
            },
            { status: 500 },
        );
    }
}
