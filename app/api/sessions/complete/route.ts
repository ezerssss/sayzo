import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import {
    consumeCreditOrThrow,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import { openai } from "@ai-sdk/openai";
import {
    analyzeSession,
    generateSessionFeedback,
    type ReplayContext,
} from "@/services/analyzer";
import type { CaptureTranscriptLine, CaptureType } from "@/schemas";
import { reconcileMoments } from "@/lib/transcripts/anchor-resolver";
import { transcribeAudioFileWithUtterances } from "@/services/deepgram-audio-transcription";
import { mergeDrillNotesFromSession } from "@/services/learner-context-updater";
import { refreshSkillMemoryFromLatestSession } from "@/services/skill-memory-updater";
import { modelTuningOptions } from "@/lib/openai/reasoning";
import { Output, generateText, zodSchema } from "ai";
import { runInstrumentedLLM } from "@/lib/llm/instrument";
import { randomUUID } from "node:crypto";
import {
    getOrHydrateLearnerModel,
    learnerModelDoc,
} from "@/lib/learner-model/store";
import type { SessionType } from "@/schemas";
import type { UserProfileType } from "@/schemas";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

type TranscriptionSegment = {
    start?: number;
    text?: string;
};

function formatTimestamp(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hh = Math.floor(safe / 3600);
    const mm = Math.floor((safe % 3600) / 60);
    const ss = safe % 60;
    if (hh > 0) {
        return `${hh}:${mm.toString().padStart(2, "0")}:${ss
            .toString()
            .padStart(2, "0")}`;
    }
    return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function buildTimestampedTranscript(
    segments: TranscriptionSegment[] | undefined,
    fallbackText: string,
): string {
    if (!Array.isArray(segments) || segments.length === 0) {
        return fallbackText;
    }
    const lines = segments
        .map((segment) => {
            const text = (segment.text ?? "").trim();
            if (!text) return "";
            const start = typeof segment.start === "number" ? segment.start : 0;
            return `[${formatTimestamp(start)}] ${text}`;
        })
        .filter((line) => line.length > 0);
    return lines.length > 0 ? lines.join("\n") : fallbackText;
}

const attemptCheckSchema = z.object({
    isAttemptUsable: z.boolean(),
    isRelatedToDrill: z.boolean(),
    hasCoachableSignal: z.boolean(),
    reason: z.string(),
});

async function isActiveProcessingJob(
    sessionRef: {
        get: () => Promise<{ exists: boolean; data: () => unknown }>;
    },
    processingJobId: string,
): Promise<boolean> {
    const snap = await sessionRef.get();
    if (!snap.exists) return false;
    const data = snap.data() as Partial<SessionType>;
    return data.processingJobId === processingJobId;
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    const formData = await request.formData();
    const sessionIdRaw = formData.get("sessionId");
    const audio = formData.get("audio");

    const sessionId =
        typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";

    if (!sessionId) {
        return NextResponse.json(
            { error: "Missing sessionId." },
            { status: 400 },
        );
    }
    if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json(
            { error: "Missing or empty audio file." },
            { status: 400 },
        );
    }

    const extensionForMime = (mime: string) => {
        const normalized = mime.toLowerCase();
        if (normalized.includes("webm")) return "webm";
        if (normalized.includes("ogg")) return "ogg";
        if (normalized.includes("wav")) return "wav";
        if (normalized.includes("mpeg") || normalized.includes("mp3"))
            return "mp3";
        if (normalized.includes("mp4")) return "mp4";
        return "webm";
    };

    let processingJobId: string | null = null;
    try {
        const db = getAdminFirestore();
        const bucket = getAdminStorageBucket();
        processingJobId = randomUUID();

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

        // Idempotency / double-processing guards — the credit charged at drill
        // creation is wasted if a client re-POSTs and we re-run transcription
        // + LLM on an already-analyzed (or in-flight) session.
        if (session.processingStatus === "processing") {
            return NextResponse.json(
                {
                    error: "already_processing",
                    message: "Analysis is already running for this replay.",
                },
                { status: 409 },
            );
        }
        // needs_retry sessions still have `session.analysis` populated from
        // the prior attempt, so we don't block on `analysis !== null` here —
        // only on terminal status. The retry path overwrites analysis/feedback
        // in the transactional claim below.
        if (
            session.completionStatus !== "pending" &&
            session.completionStatus !== "needs_retry"
        ) {
            return NextResponse.json(
                {
                    error: "invalid_state",
                    message: `Cannot analyze a replay with status "${session.completionStatus}".`,
                },
                { status: 409 },
            );
        }

        // Credit charge moved here from /new-drill so pre-generated drills
        // cost nothing until the user actually records. needs_retry
        // re-submits are still covered by the original charge — we only
        // consume a credit when this is the first record attempt for this
        // session (no audio uploaded yet).
        const isFirstRecordAttempt =
            !session.audioObjectPath?.trim() && !session.transcript?.trim();
        if (isFirstRecordAttempt) {
            try {
                await consumeCreditOrThrow(uid);
            } catch (err) {
                if (err instanceof CreditLimitReachedError) {
                    return creditLimitResponse();
                }
                throw err;
            }
        }

        // Transactionally claim the "processing" slot so a parallel submit
        // that slipped past the check above lands on 409.
        const PROCESSING_RACE = "PROCESSING_RACE";
        try {
            await db.runTransaction(async (tx) => {
                const fresh = await tx.get(sessionRef);
                const freshSession = fresh.data() as SessionType | undefined;
                if (freshSession?.processingStatus === "processing") {
                    throw new Error(PROCESSING_RACE);
                }
                tx.set(
                    sessionRef,
                    {
                        audioUrl: null,
                        audioObjectPath: null,
                        transcript: null,
                        serverTranscript: null,
                        analysis: null,
                        feedback: null,
                        completionStatus: "pending",
                        completionReason: null,
                        processingStatus: "processing",
                        processingStage: "transcribing",
                        processingJobId,
                        processingError: null,
                        processingUpdatedAt: new Date().toISOString(),
                    },
                    { merge: true },
                );
            });
        } catch (err) {
            if (err instanceof Error && err.message === PROCESSING_RACE) {
                return NextResponse.json(
                    {
                        error: "already_processing",
                        message: "Analysis is already running for this replay.",
                    },
                    { status: 409 },
                );
            }
            throw err;
        }

        const userSnap = await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .get();
        if (!userSnap.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }
        const userProfile = userSnap.data() as UserProfileType;

        const model = await getOrHydrateLearnerModel(db, uid);
        const skillMemory = {
            strengths: model.strengths,
            weaknesses: model.weaknesses,
            masteredFocus: model.masteredFocus,
            reinforcementFocus: model.reinforcementFocus,
        };

        // 1) Transcribe via Deepgram Nova-3 batch. utterances=true gives
        // segment boundaries that buildTimestampedTranscript turns into
        // [MM:SS] text lines for the analyzer + feedback prompts.
        const audioBytes = new Uint8Array(await audio.arrayBuffer());

        let deepgramResult: Awaited<
            ReturnType<typeof transcribeAudioFileWithUtterances>
        >;
        try {
            // Per-user keyterm hints from accepted transcript corrections.
            deepgramResult = await transcribeAudioFileWithUtterances(
                audio,
                model.asrVocabulary,
                { uid, sessionId },
            );
        } catch (transcribeError) {
            console.error(
                "[app/api/sessions/complete] transcription failed",
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

        const transcript = buildTimestampedTranscript(
            deepgramResult.utterances.map((u) => ({
                start: u.start,
                text: u.transcript,
            })),
            deepgramResult.text,
        ).trim();
        if (!transcript) {
            return NextResponse.json(
                { error: "Transcription returned empty text." },
                { status: 500 },
            );
        }

        // Structured per-utterance transcript alongside the flat string.
        // The flat string stays because analyzer / feedback prompts and
        // feedback-chat all rely on its `[mm:ss] text` format. The structured
        // form powers the drill transcript UI (per-line blue-accented rows +
        // inline coaching-moment badges) and mirrors captures.
        const serverTranscript: CaptureTranscriptLine[] =
            deepgramResult.utterances
                .filter((u) => (u.transcript ?? "").trim().length > 0)
                .map((u) => ({
                    speaker: "user",
                    start: u.start,
                    end: u.end,
                    text: u.transcript.trim(),
                }));

        // 2) Upload audio to Firebase Storage + persist URL
        await sessionRef.set(
            {
                processingStatus: "processing",
                processingStage: "uploading",
                processingJobId,
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );
        const ext = extensionForMime(audio.type || "");
        const objectPath = `drills/${uid}/${sessionId}/${randomUUID()}.${ext}`;

        const file = bucket.file(objectPath);
        await file.save(Buffer.from(audioBytes), {
            resumable: false,
            contentType: audio.type || "application/octet-stream",
        });

        // Long-lived signed URL for playback
        const [audioUrl] = await file.getSignedUrl({
            action: "read",
            expires: "2500-01-01",
        });
        const previousAudioObjectPath = session.audioObjectPath?.trim() || "";
        if (previousAudioObjectPath && previousAudioObjectPath !== objectPath) {
            await bucket
                .file(previousAudioObjectPath)
                .delete({ ignoreNotFound: true })
                .catch((cleanupError: unknown) => {
                    console.warn(
                        "[app/api/sessions/complete] Failed to delete previous audio",
                        cleanupError,
                    );
                });
        }

        await sessionRef.set(
            {
                audioUrl,
                audioObjectPath: objectPath,
                transcript,
                serverTranscript,
                processingStatus: "processing",
                processingStage: "analyzing",
                processingJobId,
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        let shouldSkipDeepAnalysis = false;
        let shouldRequireRetry = false;
        let skipReason = "";
        const relevanceCheckModel =
            process.env.ANALYZER_MODEL?.trim() || "gpt-4o-mini";
        const relevanceSystem = `You are a strict evaluator for spoken drill validity.

CONTEXT: drills are 60-second bite-sized recordings, hard-capped at 60s. Responses commonly stop mid-sentence at the buzzer — that is BY DESIGN, not a retry signal. A focused 20-50 second answer that ends abruptly is normal and fully coachable.

Decide three booleans:

isRelatedToDrill — false ONLY when the transcript is clearly off-topic relative to the assigned scenario (talking about something completely different, refusing to engage, reading random text, etc.). Tangentially related or weakly-on-topic content is still related.

isAttemptUsable — false ONLY for unsalvageable attempts: silence, single-word fragments ("um", "hello"), pure noise/filler with no attempted answer, or an explicit refusal ("I can't do this"). A short-but-on-task answer (even ~10 words) is usable. Mid-thought endings at the time cap are usable.

hasCoachableSignal — true when there is any real attempt to answer the prompt, even if rough, fragmented, or cut off. False only when content is effectively uncoachable (silence, noise, single word).

Bias toward usable+coachable. The user just hit a 60-second wall — don't punish them for it. Only force a retry when the response truly cannot be analyzed.

Return only the schema fields.`;
        const { result: relevanceCheck } = await runInstrumentedLLM({
            promptKey: "session.relevance",
            model: relevanceCheckModel,
            promptParts: { system: relevanceSystem },
            refs: { uid, sessionId },
            call: () =>
                generateText({
                    model: openai(relevanceCheckModel),
                    output: Output.object({
                        schema: zodSchema(attemptCheckSchema),
                        name: "AttemptRelevanceCheck",
                        description:
                            "Checks whether a spoken response is usable and related to the assigned drill.",
                    }),
                    system: relevanceSystem,
                    prompt: `## Drill
Category: ${session.plan.scenario.category}
Title: ${session.plan.scenario.title}
Question: ${session.plan.scenario.question}
Skill target: ${session.plan.skillTarget}
Time cap: ${session.plan.maxDurationSeconds ?? 60} seconds (hard stop — mid-thought endings are expected)

## Transcript
${transcript}`,
                    // Three booleans + a sentence — minimal reasoning effort.
                    ...modelTuningOptions(relevanceCheckModel, {
                        temperature: 0,
                        reasoningEffort: "minimal",
                    }),
                }),
        });

        const relevanceReason =
            relevanceCheck.output.reason.trim() ||
            "The response was not sufficiently related to the drill.";
        const isAttemptUsable = relevanceCheck.output.isAttemptUsable;
        const isRelatedToDrill = relevanceCheck.output.isRelatedToDrill;
        const hasCoachableSignal = relevanceCheck.output.hasCoachableSignal;

        shouldRequireRetry = !isAttemptUsable || !isRelatedToDrill;
        shouldSkipDeepAnalysis =
            !isRelatedToDrill || (!isAttemptUsable && !hasCoachableSignal);
        if (shouldRequireRetry) {
            skipReason = relevanceReason;
        }

        // 4) Analyzer output (structured + markdown feedback)
        let analysis;
        let feedback;
        let completionStatus: SessionType["completionStatus"];
        let completionReason: string | null;
        if (shouldSkipDeepAnalysis) {
            analysis = {
                overview:
                    "Attempt evidence is too limited or off-target for deep diagnosis. The main priority is producing a drill-aligned response with enough substance so coaching can be specific and reliable.",
                mainIssue:
                    "Response was off-task or too limited for reliable drill analysis.",
                mainIssueShape: null,
                secondaryIssues: [skipReason].filter((v) => v.length > 0),
                whatWentWell: null,
                fixTheseFirst: [],
                structureAndFlow: [],
                clarityAndConciseness: [],
                relevanceAndFocus: [skipReason].filter((v) => v.length > 0),
                engagement: [],
                professionalism: [],
                improvements: [],
                regressions: [],
                notes: "Skipped deep analysis to avoid hallucinated feedback.",
            };
            feedback = {
                improvedVersion: null,
            };
            completionStatus = "needs_retry";
            completionReason = skipReason;
        } else {
            // Load source capture for comparison feedback if this is a replay
            let replayContext: ReplayContext | undefined;
            if (session.type === "scenario_replay" && session.sourceCaptureId) {
                try {
                    const captureSnap = await db
                        .collection(FirestoreCollections.captures.path)
                        .doc(session.sourceCaptureId)
                        .get();
                    const capture = captureSnap.data() as
                        | CaptureType
                        | undefined;
                    if (capture?.analysis) {
                        replayContext = {
                            sourceCapture: {
                                title: capture.serverTitle ?? capture.title,
                                summary:
                                    capture.serverSummary ?? capture.summary,
                                transcript: capture.serverTranscript ?? [],
                                analysis: capture.analysis,
                            },
                        };
                    }
                } catch (err) {
                    console.warn(
                        `[sessions/complete] Could not load source capture ${session.sourceCaptureId} for replay context:`,
                        err,
                    );
                    // Fall back to non-comparison analysis silently
                }
            }

            // Recent same-modality headlines so the analyzer can be differential
            // (acknowledge a persisting habit, then redirect — don't re-headline).
            const recentDrillsSnap = await db
                .collection(FirestoreCollections.sessions.path)
                .where("uid", "==", uid)
                .orderBy("createdAt", "desc")
                .limit(8)
                .get();
            const differential = {
                trackedPatterns: model.trackedPatterns,
                recentMainIssues: recentDrillsSnap.docs
                    .map((d) => d.data() as SessionType)
                    .filter((s) => s.id !== sessionId && s.analysis?.mainIssue)
                    .slice(0, 5)
                    .map((s) => ({
                        sourceId: s.id,
                        mainIssue: s.analysis!.mainIssue,
                        createdAt: s.createdAt,
                    })),
            };

            const llmAnalysis = await analyzeSession(
                {
                    userProfile: {
                        role: userProfile.role,
                        industry: userProfile.industry,
                        companyName: userProfile.companyName ?? "",
                        companyDescription:
                            userProfile.companyDescription ?? "",
                        workplaceCommunicationContext:
                            userProfile.workplaceCommunicationContext ?? "",
                        wantsInterviewPractice:
                            userProfile.wantsInterviewPractice ?? false,
                        motivation: userProfile.motivation ?? "",
                        goals: userProfile.goals,
                        additionalContext: userProfile.additionalContext,
                    },
                    skillMemory: {
                        strengths: skillMemory.strengths,
                        weaknesses: skillMemory.weaknesses,
                        masteredFocus: skillMemory.masteredFocus,
                        reinforcementFocus: skillMemory.reinforcementFocus,
                    },
                    differential,
                    session: {
                        plan: session.plan,
                        transcript,
                    },
                },
                replayContext,
                { uid, sessionId },
            );

            const reconciledFixes = reconcileMoments(
                llmAnalysis.fixTheseFirst,
                serverTranscript,
            );
            analysis = {
                ...llmAnalysis,
                fixTheseFirst: reconciledFixes,
                // If the anchor resolver dropped every moment, clear the shape
                // too — the principle ladder (mainIssue → shape → fixes) must
                // not render a shape card with no fixes to anchor it.
                mainIssueShape:
                    reconciledFixes.length > 0
                        ? (llmAnalysis.mainIssueShape ?? null)
                        : null,
            };

            feedback = await generateSessionFeedback(
                {
                    userProfile: {
                        role: userProfile.role,
                        industry: userProfile.industry,
                        companyName: userProfile.companyName ?? "",
                        companyDescription:
                            userProfile.companyDescription ?? "",
                        workplaceCommunicationContext:
                            userProfile.workplaceCommunicationContext ?? "",
                        wantsInterviewPractice:
                            userProfile.wantsInterviewPractice ?? false,
                        motivation: userProfile.motivation ?? "",
                        goals: userProfile.goals,
                        additionalContext: userProfile.additionalContext,
                    },
                    skillMemory: {
                        strengths: skillMemory.strengths,
                        weaknesses: skillMemory.weaknesses,
                        masteredFocus: skillMemory.masteredFocus,
                        reinforcementFocus: skillMemory.reinforcementFocus,
                    },
                    differential,
                    session: {
                        plan: session.plan,
                        transcript,
                    },
                },
                { sessionAnalysis: analysis },
                replayContext,
                { uid, sessionId },
            );
            completionStatus = shouldRequireRetry ? "needs_retry" : "passed";
            completionReason = shouldRequireRetry ? skipReason : null;
        }

        await sessionRef.set(
            {
                processingStatus: "processing",
                processingStage: "combining",
                processingJobId,
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        const stillActive = await isActiveProcessingJob(
            sessionRef,
            processingJobId,
        );
        if (!stillActive) {
            return NextResponse.json({
                ok: true,
                audioUrl,
                transcript,
                analysis,
                feedback,
                completionStatus,
                completionReason,
            });
        }

        await sessionRef.set(
            {
                audioUrl,
                audioObjectPath: objectPath,
                transcript,
                serverTranscript,
                analysis,
                feedback,
                completionStatus,
                completionReason,
                processingStatus: "idle",
                processingStage: null,
                processingJobId: null,
                processingError: null,
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        try {
            if (!shouldSkipDeepAnalysis && transcript.trim().length >= 120) {
                const freshModel = await getOrHydrateLearnerModel(db, uid);
                if (freshModel.lastLearnerContextSessionId !== sessionId) {
                    const { drillNotes } = await mergeDrillNotesFromSession({
                        previousDrillNotes:
                            freshModel.context.drillNotes.trim(),
                        plan: session.plan,
                        transcript,
                        completionStatus,
                    });
                    // Write only `context.drillNotes` (Firestore deep-merges
                    // nested maps, preserving realWorldNotes/deliveryNotes a
                    // concurrent capture writer may have just set). Spreading
                    // the stale `freshModel.context` here would clobber them.
                    await learnerModelDoc(db, uid).set(
                        {
                            context: { drillNotes },
                            lastLearnerContextSessionId: sessionId,
                            updatedAt: new Date().toISOString(),
                        },
                        { merge: true },
                    );
                }
            }
        } catch (learnerContextError) {
            console.error(
                "[app/api/sessions/complete] internal learner context update failed",
                learnerContextError,
            );
        }

        // Update skill memory (strengths / weaknesses / focus + tracked
        // habits) from this completed replay so the learner model keeps
        // improving. This used to run as a side effect of next-drill
        // pre-generation; standalone drills are gone, so we trigger it directly
        // here. Fire-and-forget with a logged catch so it never blocks the
        // response; internally idempotent (guards on the lastProcessedSessionId
        // cursor + feedback content, so the off-task needs_retry path no-ops).
        // Cast mirrors the original `.data() as SessionType` read this refresh
        // used to do: the off-task skip path stores a deliberately degraded
        // `analysis` (empty dimensions), but the refresh guards on feedback
        // content and never reads it in that case.
        const completedSession = {
            ...session,
            analysis,
            feedback,
            completionStatus,
            completionReason,
        } as SessionType;
        void refreshSkillMemoryFromLatestSession(
            db,
            uid,
            model,
            completedSession,
        ).catch((skillMemoryError) => {
            console.error(
                "[app/api/sessions/complete] skill-memory refresh failed",
                skillMemoryError,
            );
        });

        return NextResponse.json({
            ok: true,
            audioUrl,
            transcript,
            analysis,
            feedback,
            completionStatus,
            completionReason,
        });
    } catch (error) {
        console.error("[app/api/sessions/complete] POST failed", error);
        if (sessionId) {
            try {
                const db = getAdminFirestore();
                const sessionRef = db
                    .collection(FirestoreCollections.sessions.path)
                    .doc(sessionId);
                const snap = await sessionRef.get();
                const existing = snap.data() as
                    | Partial<SessionType>
                    | undefined;
                if (
                    !processingJobId ||
                    existing?.processingJobId !== processingJobId
                ) {
                    return NextResponse.json(
                        {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "Failed to complete session.",
                        },
                        { status: 500 },
                    );
                }
                await sessionRef.set(
                    {
                        processingStatus: "failed",
                        processingStage: null,
                        processingJobId: null,
                        processingError:
                            error instanceof Error
                                ? error.message
                                : "Failed to complete session.",
                        processingUpdatedAt: new Date().toISOString(),
                    },
                    { merge: true },
                );
            } catch (persistError) {
                console.error(
                    "Failed to persist session processing error",
                    persistError,
                );
            }
        }
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to complete session.",
            },
            { status: 500 },
        );
    }
}
