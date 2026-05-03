import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
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
import type {
    CaptureTranscriptLine,
    CaptureType,
    TeachableMoment,
} from "@/types/captures";
import { transcribeAudioFileWithUtterances } from "@/services/deepgram-audio-transcription";
import { pregenerateNextDrillFor } from "@/services/drill-pre-generator";
import { mergeInternalLearnerContextFromSession } from "@/services/learner-context-updater";
import { measureSessionExpression } from "@/services/hume-expression";
import { Output, generateText, zodSchema } from "ai";
import { randomUUID } from "node:crypto";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { SessionType } from "@/types/sessions";
import type { UserProfileType } from "@/types/user";
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

/**
 * The analyzer LLM emits `transcriptIdx` (which utterance the moment is in)
 * and `timestamp` (seconds). The first is bounded and easy to get right; the
 * second is a continuous number and frequently drifts. Override the model's
 * timestamp with the actual utterance start when transcriptIdx is valid, so
 * "Play 0:13" actually seeks to the moment we quoted.
 */
function reconcileFixTimestamps(
    fixes: TeachableMoment[],
    serverTranscript: CaptureTranscriptLine[],
): TeachableMoment[] {
    if (serverTranscript.length === 0) return fixes;
    return fixes.map((fix) => {
        const idx = fix.transcriptIdx;
        if (
            Number.isInteger(idx) &&
            idx >= 0 &&
            idx < serverTranscript.length
        ) {
            const utt = serverTranscript[idx];
            if (Number.isFinite(utt.start) && utt.start >= 0) {
                return { ...fix, timestamp: utt.start };
            }
        }
        // transcriptIdx invalid — try anchor substring match before giving up.
        const anchor = (fix.anchor ?? "").trim().toLowerCase();
        if (anchor.length >= 6) {
            const probe = anchor.slice(0, Math.min(40, anchor.length));
            for (let i = 0; i < serverTranscript.length; i++) {
                const text = serverTranscript[i].text.toLowerCase();
                if (text.includes(probe) || probe.includes(text.slice(0, 30))) {
                    return {
                        ...fix,
                        transcriptIdx: i,
                        timestamp: serverTranscript[i].start,
                    };
                }
            }
        }
        return fix;
    });
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
        // + Hume + LLM on an already-analyzed (or in-flight) session.
        if (session.processingStatus === "processing") {
            return NextResponse.json(
                {
                    error: "already_processing",
                    message: "Analysis is already running for this drill.",
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
                    message: `Cannot analyze a drill with status "${session.completionStatus}".`,
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
            !session.audioObjectPath?.trim() &&
            !session.transcript?.trim();
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
                        message: "Analysis is already running for this drill.",
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

        const skillSnap = await db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid)
            .get();
        const skillData = skillSnap.data();
        const skillMemory: SkillMemoryType = skillData
            ? {
                  uid,
                  strengths: Array.isArray(skillData.strengths)
                      ? (skillData.strengths as string[])
                      : [],
                  weaknesses: Array.isArray(skillData.weaknesses)
                      ? (skillData.weaknesses as string[])
                      : [],
                  masteredFocus: Array.isArray(skillData.masteredFocus)
                      ? (skillData.masteredFocus as string[])
                      : [],
                  reinforcementFocus: Array.isArray(
                      skillData.reinforcementFocus,
                  )
                      ? (skillData.reinforcementFocus as string[])
                      : [],
                  lastProcessedSessionId:
                      typeof skillData.lastProcessedSessionId === "string"
                          ? skillData.lastProcessedSessionId
                          : null,
                  createdAt:
                      typeof skillData.createdAt === "string"
                          ? skillData.createdAt
                          : new Date().toISOString(),
                  updatedAt:
                      typeof skillData.updatedAt === "string"
                          ? skillData.updatedAt
                          : new Date().toISOString(),
              }
            : {
                  uid,
                  strengths: [],
                  weaknesses: [],
                  masteredFocus: [],
                  reinforcementFocus: [],
                  lastProcessedSessionId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
              };

        // 1) Transcribe via Deepgram Nova-3 batch. utterances=true gives
        // segment boundaries that buildTimestampedTranscript turns into
        // [MM:SS] text lines for the analyzer + feedback prompts.
        const audioBytes = new Uint8Array(await audio.arrayBuffer());

        let deepgramResult: Awaited<
            ReturnType<typeof transcribeAudioFileWithUtterances>
        >;
        try {
            deepgramResult = await transcribeAudioFileWithUtterances(audio);
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
        const serverTranscript: CaptureTranscriptLine[] = deepgramResult.utterances
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
        const objectPath = `${uid}/${sessionId}/${randomUUID()}.${ext}`;

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
                processingStage: "analyzing_expression",
                processingJobId,
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        // 3) Hume expression is required for final analysis.
        const humeTrimmed = await measureSessionExpression({
            audio: audioBytes,
            transcript,
            filename: audio.name || "response.webm",
            contentType: audio.type || "application/octet-stream",
        });

        await sessionRef.set(
            {
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
        const relevanceCheck = await generateText({
            model: openai(process.env.ANALYZER_MODEL?.trim() || "gpt-4o-mini"),
            output: Output.object({
                schema: zodSchema(attemptCheckSchema),
                name: "AttemptRelevanceCheck",
                description:
                    "Checks whether a spoken response is usable and related to the assigned drill.",
            }),
            system: `You are a strict evaluator for spoken drill validity.

CONTEXT: drills are 60-second bite-sized recordings, hard-capped at 60s. Responses commonly stop mid-sentence at the buzzer — that is BY DESIGN, not a retry signal. A focused 20-50 second answer that ends abruptly is normal and fully coachable.

Decide three booleans:

isRelatedToDrill — false ONLY when the transcript is clearly off-topic relative to the assigned scenario (talking about something completely different, refusing to engage, reading random text, etc.). Tangentially related or weakly-on-topic content is still related.

isAttemptUsable — false ONLY for unsalvageable attempts: silence, single-word fragments ("um", "hello"), pure noise/filler with no attempted answer, or an explicit refusal ("I can't do this"). A short-but-on-task answer (even ~10 words) is usable. Mid-thought endings at the time cap are usable.

hasCoachableSignal — true when there is any real attempt to answer the prompt, even if rough, fragmented, or cut off. False only when content is effectively uncoachable (silence, noise, single word).

Bias toward usable+coachable. The user just hit a 60-second wall — don't punish them for it. Only force a retry when the response truly cannot be analyzed.

Return only the schema fields.`,
            prompt: `## Drill
Category: ${session.plan.scenario.category}
Title: ${session.plan.scenario.title}
Situation: ${session.plan.scenario.situationContext}
Given content: ${session.plan.scenario.givenContent}
Framework: ${session.plan.scenario.framework}
Skill target: ${session.plan.skillTarget}
Time cap: ${session.plan.maxDurationSeconds ?? 60} seconds (hard stop — mid-thought endings are expected)

## Transcript
${transcript}`,
            temperature: 0,
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
                secondaryIssues: [skipReason].filter((v) => v.length > 0),
                fixTheseFirst: [],
                structureAndFlow: [],
                clarityAndConciseness: [],
                relevanceAndFocus: [skipReason].filter((v) => v.length > 0),
                engagement: [],
                professionalism: [],
                voiceToneExpression: [],
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
            if (
                session.type === "scenario_replay" &&
                session.sourceCaptureId
            ) {
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
                                title:
                                    capture.serverTitle ?? capture.title,
                                summary:
                                    capture.serverSummary ?? capture.summary,
                                transcript:
                                    capture.serverTranscript ??
                                    capture.agentTranscript,
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

            analysis = await analyzeSession({
                userProfile: {
                    role: userProfile.role,
                    industry: userProfile.industry,
                    companyName: userProfile.companyName ?? "",
                    companyDescription: userProfile.companyDescription ?? "",
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
                session: {
                    plan: session.plan,
                    transcript,
                    humeContext: JSON.stringify(humeTrimmed),
                },
            }, replayContext);

            // Override LLM-emitted timestamps with utterance ground truth so
            // "Play 0:13" actually seeks to the moment we quoted.
            analysis = {
                ...analysis,
                fixTheseFirst: reconcileFixTimestamps(
                    analysis.fixTheseFirst,
                    serverTranscript,
                ),
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
                    session: {
                        plan: session.plan,
                        transcript,
                        humeContext: JSON.stringify(humeTrimmed),
                    },
                },
                { sessionAnalysis: analysis },
                replayContext,
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
                const userRef = db
                    .collection(FirestoreCollections.users.path)
                    .doc(uid);
                const freshUserSnap = await userRef.get();
                const freshProfile = freshUserSnap.data() as
                    | UserProfileType
                    | undefined;
                if (
                    freshProfile &&
                    freshProfile.lastInternalLearnerContextSessionId !==
                        sessionId
                ) {
                    const { internalLearnerContext } =
                        await mergeInternalLearnerContextFromSession({
                            previousInternalLearnerContext:
                                freshProfile.internalLearnerContext.trim(),
                            plan: session.plan,
                            transcript,
                            completionStatus,
                        });
                    await userRef.set(
                        {
                            internalLearnerContext,
                            lastInternalLearnerContextSessionId: sessionId,
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

        // Track first-drill milestone for the install nudge cadence (every
        // drill in the first 7 days, then weekly until the desktop helper is
        // installed). Only terminal statuses count.
        try {
            const userRef = db
                .collection(FirestoreCollections.users.path)
                .doc(uid);
            const freshUserSnap = await userRef.get();
            const freshProfile = freshUserSnap.data() as
                | UserProfileType
                | undefined;
            if (freshProfile && !freshProfile.firstDrillCompletedAt) {
                await userRef.set(
                    {
                        firstDrillCompletedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    { merge: true },
                );
            }
        } catch (firstDrillError) {
            console.error(
                "[app/api/sessions/complete] firstDrillCompletedAt write failed",
                firstDrillError,
            );
        }

        // Pre-generate the user's next drill so the home page is never blank.
        // Idempotent — if a pending drill already exists, this no-ops. Only
        // fires on terminal status (skip on needs_retry; user must redo the
        // current drill first).
        if (completionStatus === "passed") {
            void pregenerateNextDrillFor(uid).catch((preGenError) => {
                console.error(
                    "[app/api/sessions/complete] pre-generation failed",
                    preGenError,
                );
            });
        }

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
