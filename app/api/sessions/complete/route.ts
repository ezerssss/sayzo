import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import { openai } from "@ai-sdk/openai";
import { analyzeSession, generateSessionFeedback } from "@/services/analyzer";
import { measureSessionExpression } from "@/services/hume-expression";
import { Output, generateText, zodSchema } from "ai";
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

function countWords(text: string): number {
    const matches = text.match(/[A-Za-z0-9']+/g);
    return matches?.length ?? 0;
}

const attemptCheckSchema = z.object({
    isAttemptUsable: z.boolean(),
    isRelatedToDrill: z.boolean(),
    reason: z.string(),
});

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

    try {
        const db = getAdminFirestore();
        const bucket = getAdminStorageBucket();

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
                  reinforcementFocus: Array.isArray(skillData.reinforcementFocus)
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

        let res = await sendTranscriptionRequest(configuredModel, "verbose_json");
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
                    res = await sendTranscriptionRequest(configuredModel, "json");
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
        const ext = extensionForMime(audio.type || "");
        const objectPath = `${uid}/${sessionId}.${ext}`;

        const file = bucket.file(objectPath);
        await file.save(Buffer.from(audioBytes), {
            resumable: false,
            contentType: audio.type || "application/octet-stream",
            metadata: {
                cacheControl: "public, max-age=31536000",
            },
        });

        // Long-lived signed URL for playback
        const [audioUrl] = await file.getSignedUrl({
            action: "read",
            expires: "2500-01-01",
        });

        // 3) Hume trimmed signals for delivery context (optional, but powerful for analyzer)
        const humeTrimmed = await measureSessionExpression({
            audio: audioBytes,
            transcript,
            filename: audio.name || "response.webm",
            contentType: audio.type || "application/octet-stream",
        });

        const transcriptWordCount = countWords(transcript);
        const obviouslyTooShort = transcriptWordCount < 8;
        let shouldSkipDeepAnalysis = obviouslyTooShort;
        let skipReason = obviouslyTooShort
            ? "The response is too short to evaluate meaningfully."
            : "";

        if (!obviouslyTooShort) {
            const relevanceCheck = await generateText({
                model: openai(process.env.ANALYZER_MODEL?.trim() || "gpt-4o-mini"),
                output: Output.object({
                    schema: zodSchema(attemptCheckSchema),
                    name: "AttemptRelevanceCheck",
                    description:
                        "Checks whether a spoken response is usable and related to the assigned drill.",
                }),
                system: `You are a strict evaluator for spoken drill validity.
If response is too short, empty, or clearly unrelated to the assigned drill, mark it not usable.
Be conservative: do not infer relevance from weak evidence.
Return only the schema fields.`,
                prompt: `## Drill
Title: ${session.plan.scenario.title}
Situation: ${session.plan.scenario.situationContext}
Given content: ${session.plan.scenario.givenContent}
Framework: ${session.plan.scenario.framework}
Skill target: ${session.plan.skillTarget}

## Transcript
${transcript}`,
                temperature: 0,
            });

            if (
                !relevanceCheck.output.isAttemptUsable ||
                !relevanceCheck.output.isRelatedToDrill
            ) {
                shouldSkipDeepAnalysis = true;
                skipReason = relevanceCheck.output.reason.trim() || "The response was not sufficiently related to the drill.";
            }
        }

        // 4) Analyzer output (structured + markdown feedback)
        let analysis;
        let feedback;
        let completionStatus: SessionType["completionStatus"];
        let completionReason: string | null;
        if (shouldSkipDeepAnalysis) {
            analysis = {
                mainIssue: "Response was too short or off-task for reliable drill analysis.",
                secondaryIssues: [skipReason].filter((v) => v.length > 0),
                improvements: [],
                regressions: [],
                notes: "Skipped deep analysis to avoid hallucinated feedback.",
            };
            feedback = `This attempt is too short or not aligned enough with the drill to generate reliable coaching.

Reason: ${skipReason}

Try one more pass and follow the framework for at least 45-90 seconds, using 2 or more concrete facts from the drill prompt.`;
            completionStatus = "needs_retry";
            completionReason = skipReason;
        } else {
            analysis = await analyzeSession({
                userProfile: {
                    role: userProfile.role,
                    industry: userProfile.industry,
                    companyName: userProfile.companyName ?? "",
                    companyDescription: userProfile.companyDescription ?? "",
                    workplaceCommunicationContext:
                        userProfile.workplaceCommunicationContext ?? "",
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
            });

            feedback = await generateSessionFeedback(
                {
                    userProfile: {
                        role: userProfile.role,
                        industry: userProfile.industry,
                        companyName: userProfile.companyName ?? "",
                        companyDescription: userProfile.companyDescription ?? "",
                        workplaceCommunicationContext:
                            userProfile.workplaceCommunicationContext ?? "",
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
            );
            completionStatus = "passed";
            completionReason = null;
        }

        await sessionRef.set(
            {
                audioUrl,
                transcript,
                analysis,
                feedback,
                completionStatus,
                completionReason,
            },
            { merge: true },
        );

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
        console.error(error);
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
