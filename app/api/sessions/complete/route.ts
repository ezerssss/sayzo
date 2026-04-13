import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import { openai } from "@ai-sdk/openai";
import {
    analyzeSession,
    generateSessionFeedback,
    type ReplayContext,
} from "@/services/analyzer";
import type { CaptureType } from "@/types/captures";
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

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const TIMESTAMP_FALLBACK_MODEL = "whisper-1";
const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts (e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). Do not rewrite, summarize, or correct grammar. Keep the original wording and pacing cues as text.";

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
    const formData = await request.formData();
    const uidRaw = formData.get("uid");
    const sessionIdRaw = formData.get("sessionId");
    const audio = formData.get("audio");

    const uid = typeof uidRaw === "string" ? uidRaw.trim() : "";
    const sessionId =
        typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";

    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }
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

        await sessionRef.set(
            {
                audioUrl: null,
                audioObjectPath: null,
                transcript: null,
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

        // 1) Transcribe (verbatim prompt)
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (!apiKey) {
            return NextResponse.json(
                { error: "Missing OPENAI_API_KEY." },
                { status: 500 },
            );
        }

        const audioBytes = new Uint8Array(await audio.arrayBuffer());
        const configuredModel =
            process.env.TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL;

        const buildUpstream = (
            model: string,
            responseFormat: "verbose_json" | "json",
        ) => {
            const fd = new FormData();
            fd.append("model", model);
            fd.append("file", audio);
            fd.append("prompt", VERBATIM_PROMPT);
            fd.append("response_format", responseFormat);
            if (responseFormat === "verbose_json") {
                fd.append("timestamp_granularities[]", "segment");
            }
            return fd;
        };

        const sendTranscriptionRequest = async (
            model: string,
            responseFormat: "verbose_json" | "json",
        ) => {
            return fetch(OPENAI_TRANSCRIPTIONS_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: buildUpstream(model, responseFormat),
            });
        };

        let res = await sendTranscriptionRequest(
            configuredModel,
            "verbose_json",
        );
        if (!res.ok) {
            const detail = await res.text();
            const incompatibleVerboseJson =
                detail.includes("response_format") &&
                detail.includes("not compatible");

            if (incompatibleVerboseJson) {
                // Fallback to whisper-1 for timestamp support.
                res = await sendTranscriptionRequest(
                    TIMESTAMP_FALLBACK_MODEL,
                    "verbose_json",
                );
                if (!res.ok) {
                    // Final fallback: compatible plain json transcript.
                    res = await sendTranscriptionRequest(
                        configuredModel,
                        "json",
                    );
                }
            } else {
                return NextResponse.json(
                    { error: "Transcription failed.", detail },
                    { status: res.status },
                );
            }
        }

        if (!res.ok) {
            const detail = await res.text();
            return NextResponse.json(
                { error: "Transcription failed.", detail },
                { status: res.status },
            );
        }

        const body = (await res.json()) as {
            text?: string;
            segments?: TranscriptionSegment[];
        };
        const transcript = buildTimestampedTranscript(
            body.segments,
            (body.text ?? "").trim(),
        ).trim();
        if (!transcript) {
            return NextResponse.json(
                { error: "Transcription returned empty text." },
                { status: 500 },
            );
        }

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
Distinguish "retry needed" from "skip deep analysis":
- Retry needed can include incomplete but on-task attempts.
- Skip deep analysis is only for clearly off-task responses or evidence that is too thin to coach reliably.
Mark isRelatedToDrill=false only when the transcript is clearly unrelated to the assigned drill.
Mark isAttemptUsable=false for very incomplete attempts that should be retried, even if they are partially on-task.
Set hasCoachableSignal=true when there is enough meaningful signal to provide partial coaching (for example: attempted structure but broke flow mid-way, obvious filler overload, weak relevance, or delivery issues).
Set hasCoachableSignal=false only when content is effectively uncoachable (e.g., extremely short greeting/noise, no meaningful attempt, or unrelated chatter).
Be conservative: do not infer relevance from weak evidence.
Return only the schema fields.`,
            prompt: `## Drill
Category: ${session.plan.scenario.category}
Title: ${session.plan.scenario.title}
Situation: ${session.plan.scenario.situationContext}
Given content: ${session.plan.scenario.givenContent}
Framework: ${session.plan.scenario.framework}
Skill target: ${session.plan.skillTarget}

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
                overview:
                    "This attempt is not yet usable enough for deep coaching. Your next pass should focus on giving a complete, drill-aligned response so feedback can be more specific.",
                momentsToTighten:
                    "Not enough usable evidence from this attempt to give moment-level coaching.",
                structureAndFlow:
                    "This response is off-task or too limited, so structure and transitions cannot be evaluated reliably.",
                clarityAndConciseness:
                    "Please give a fuller answer so clarity, filler-word usage, and conciseness can be measured.",
                relevanceAndFocus: `Reason: ${skipReason}`,
                engagement:
                    "Cannot evaluate audience engagement from this attempt due to limited relevant content.",
                professionalism:
                    "Cannot evaluate professional communication quality from this attempt yet.",
                deliveryAndProsody:
                    "Prosody interpretation is limited when the response is off-task or too limited.",
                nativeSpeakerVersion: null,
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
