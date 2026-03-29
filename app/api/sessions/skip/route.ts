import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { mergeInternalDrillSignalNotes } from "@/services/drill-signal-context";
import { transcribeAudioFileToPlainText } from "@/services/openai-audio-transcription";
import type { SessionType } from "@/types/sessions";
import type { UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

function sessionHasSubmittedDrillRecording(session: SessionType): boolean {
    return (
        Boolean(session.audioUrl?.trim()) ||
        Boolean(session.audioObjectPath?.trim()) ||
        Boolean(session.transcript?.trim())
    );
}

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
    const sessionIdRaw = formData.get("sessionId");
    const skipWithoutFeedbackRaw = formData.get("skipWithoutFeedback");
    const feedbackTextRaw = formData.get("feedbackText");
    const audio = formData.get("audio");

    const uid = typeof uidRaw === "string" ? uidRaw.trim() : "";
    const sessionId =
        typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";
    const skipWithoutFeedback =
        skipWithoutFeedbackRaw === "1" || skipWithoutFeedbackRaw === "true";
    const feedbackText =
        typeof feedbackTextRaw === "string" ? feedbackTextRaw.trim() : "";

    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }
    if (!sessionId) {
        return NextResponse.json(
            { error: "Missing sessionId." },
            { status: 400 },
        );
    }

    const audioFile = audio instanceof File && audio.size > 0 ? audio : null;

    if (!skipWithoutFeedback && !audioFile && !feedbackText) {
        return NextResponse.json(
            {
                error:
                    "Provide audio or feedback text, or set skipWithoutFeedback.",
            },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const sessionRef = db
            .collection(FirestoreCollections.sessions.path)
            .doc(sessionId);
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) {
            return NextResponse.json(
                { error: "Session not found." },
                { status: 404 },
            );
        }
        const session = sessionSnap.data() as SessionType;
        if (session.uid !== uid) {
            return NextResponse.json(
                { error: "Unauthorized." },
                { status: 403 },
            );
        }
        if (session.completionStatus !== "pending") {
            return NextResponse.json(
                { error: "This drill is no longer skippable." },
                { status: 409 },
            );
        }
        if (session.processingStatus === "processing") {
            return NextResponse.json(
                { error: "Analysis is still running; wait or refresh." },
                { status: 409 },
            );
        }
        if (sessionHasSubmittedDrillRecording(session)) {
            return NextResponse.json(
                {
                    error:
                        "Cannot skip after a drill recording has already been submitted for this session.",
                },
                { status: 409 },
            );
        }

        let spoken = "";
        if (audioFile) {
            try {
                spoken = await transcribeAudioFileToPlainText(audioFile);
            } catch (transcribeError) {
                console.error(
                    "[app/api/sessions/skip] transcription failed",
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
            skipWithoutFeedback || combinedTranscript.length === 0;

        const transcriptForSession =
            combinedTranscript.length > 0 ? combinedTranscript : null;

        const nowIso = new Date().toISOString();
        await sessionRef.set(
            {
                audioUrl: null,
                audioObjectPath: null,
                transcript: transcriptForSession,
                analysis: null,
                feedback: null,
                completionStatus: "skipped",
                completionReason: null,
                processingStatus: "idle",
                processingStage: null,
                processingJobId: null,
                processingError: null,
                processingUpdatedAt: nowIso,
            },
            { merge: true },
        );

        try {
            const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
            const userSnap = await userRef.get();
            const profile = userSnap.data() as UserProfileType | undefined;
            const lastSignal =
                typeof profile?.lastDrillSignalNotesSessionId === "string"
                    ? profile.lastDrillSignalNotesSessionId.trim()
                    : "";
            if (profile && lastSignal !== sessionId) {
                const { internalDrillSignalNotes } =
                    await mergeInternalDrillSignalNotes({
                        previousInternalDrillSignalNotes:
                            profile.internalDrillSignalNotes?.trim() ?? "",
                        plan: session.plan,
                        kind: "skip",
                        signalTranscript: combinedTranscript,
                        declinedToShare,
                    });
                await userRef.set(
                    {
                        internalDrillSignalNotes,
                        lastDrillSignalNotesSessionId: sessionId,
                        updatedAt: nowIso,
                    },
                    { merge: true },
                );
            }
        } catch (mergeError) {
            console.error(
                "[app/api/sessions/skip] drill signal merge failed",
                mergeError,
            );
        }

        return NextResponse.json({
            ok: true,
            completionStatus: "skipped",
            transcript: transcriptForSession,
        });
    } catch (error) {
        console.error("[app/api/sessions/skip] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to skip drill.",
            },
            { status: 500 },
        );
    }
}
