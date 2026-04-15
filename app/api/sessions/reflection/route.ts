import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    assertHasCredit,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { mergeInternalDrillSignalNotes } from "@/services/drill-signal-context";
import { transcribeAudioFileToPlainText } from "@/services/openai-audio-transcription";
import {
    hasSessionFeedbackContent,
    type SessionType,
} from "@/types/sessions";
import type { UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Records post-drill reflection (voice/text) for a **completed** session and merges
 * into `internalDrillSignalNotes`. Called by the client **before** `new-drill` when
 * the UI chooses to show the reflection step.
 */
export async function POST(request: NextRequest) {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Expected multipart form data." },
            { status: 400 },
        );
    }

    const uidRaw = formData.get("uid");
    const priorSessionIdRaw = formData.get("priorSessionId");
    const dismissRaw = formData.get("dismissWithoutSharing");
    const feedbackTextRaw = formData.get("feedbackText");
    const audio = formData.get("audio");

    const uid = typeof uidRaw === "string" ? uidRaw.trim() : "";
    const priorSessionId =
        typeof priorSessionIdRaw === "string"
            ? priorSessionIdRaw.trim()
            : "";
    const dismissWithoutSharing =
        dismissRaw === "1" || dismissRaw === "true";
    const feedbackText =
        typeof feedbackTextRaw === "string" ? feedbackTextRaw.trim() : "";

    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }
    if (!priorSessionId) {
        return NextResponse.json(
            { error: "Missing priorSessionId." },
            { status: 400 },
        );
    }

    const audioFile = audio instanceof File && audio.size > 0 ? audio : null;

    if (!dismissWithoutSharing && !audioFile && !feedbackText) {
        return NextResponse.json(
            {
                error:
                    "Provide audio or feedback text, or set dismissWithoutSharing.",
            },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const priorRef = db
            .collection(FirestoreCollections.sessions.path)
            .doc(priorSessionId);
        const priorSnap = await priorRef.get();
        if (!priorSnap.exists) {
            return NextResponse.json(
                { error: "Prior session not found." },
                { status: 404 },
            );
        }
        const priorSession = priorSnap.data() as SessionType;
        if (priorSession.uid !== uid) {
            return NextResponse.json(
                { error: "Unauthorized." },
                { status: 403 },
            );
        }
        if (priorSession.completionStatus !== "passed") {
            return NextResponse.json(
                {
                    error:
                        "Reflection is only allowed for a completed (passed) drill.",
                },
                { status: 409 },
            );
        }
        if (!hasSessionFeedbackContent(priorSession.feedback)) {
            return NextResponse.json(
                {
                    error:
                        "That drill has no coaching feedback to reflect on yet.",
                },
                { status: 409 },
            );
        }

        // Idempotency: skip Whisper entirely if this reflection was already recorded.
        const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
        const userSnap = await userRef.get();
        const profile = userSnap.data() as UserProfileType | undefined;
        const lastSignal =
            typeof profile?.lastDrillSignalNotesSessionId === "string"
                ? profile.lastDrillSignalNotesSessionId.trim()
                : "";
        if (profile && lastSignal === priorSessionId) {
            return NextResponse.json({ alreadyRecorded: true });
        }

        try {
            await assertHasCredit(uid);
        } catch (err) {
            if (err instanceof CreditLimitReachedError) {
                return creditLimitResponse();
            }
            throw err;
        }

        let spoken = "";
        if (audioFile) {
            try {
                spoken = await transcribeAudioFileToPlainText(audioFile);
            } catch (transcribeError) {
                console.error(
                    "[app/api/sessions/reflection] transcription failed",
                    transcribeError,
                );
                return NextResponse.json(
                    {
                        error:
                            transcribeError instanceof Error
                                ? transcribeError.message
                                : "Transcription failed.",
                    },
                    { status: 500 },
                );
            }
        }

        const combinedTranscript = [spoken, feedbackText]
            .filter((s) => s.length > 0)
            .join("\n\n")
            .trim();

        const declinedToShare =
            dismissWithoutSharing || combinedTranscript.length === 0;

        const nowIso = new Date().toISOString();

        try {
            if (profile) {
                const priorTitle =
                    priorSession.plan?.scenario?.title?.trim() ||
                    "your last drill";
                const { internalDrillSignalNotes } =
                    await mergeInternalDrillSignalNotes({
                        previousInternalDrillSignalNotes:
                            profile.internalDrillSignalNotes?.trim() ?? "",
                        plan: priorSession.plan,
                        kind: "post_drill_reflection",
                        signalTranscript: combinedTranscript,
                        declinedToShare,
                        priorDrillTitle: priorTitle,
                    });
                await userRef.set(
                    {
                        internalDrillSignalNotes,
                        lastDrillSignalNotesSessionId: priorSessionId,
                        updatedAt: nowIso,
                    },
                    { merge: true },
                );
            }
        } catch (mergeError) {
            console.error(
                "[app/api/sessions/reflection] drill signal merge failed",
                mergeError,
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[app/api/sessions/reflection] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to submit reflection.",
            },
            { status: 500 },
        );
    }
}
