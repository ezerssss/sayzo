import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore, getAdminStorageBucket } from "@/lib/firebase/admin";
import { analyzeSession, generateSessionFeedback } from "@/services/analyzer";
import { measureSessionExpression } from "@/services/hume-expression";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { SessionType } from "@/types/sessions";
import type { UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts (e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). Do not rewrite, summarize, or correct grammar. Keep the original wording and pacing cues as text.";

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
                  recentFocus: Array.isArray(skillData.recentFocus)
                      ? (skillData.recentFocus as string[])
                      : [],
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
                  recentFocus: [],
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
        const upstream = new FormData();
        upstream.append(
            "model",
            process.env.TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL,
        );
        upstream.append("file", audio);
        upstream.append("prompt", VERBATIM_PROMPT);

        const res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: upstream,
        });
        if (!res.ok) {
            const detail = await res.text();
            return NextResponse.json(
                { error: "Transcription failed.", detail },
                { status: res.status },
            );
        }
        const body = (await res.json()) as { text?: string };
        const transcript = (body.text ?? "").trim();
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

        // 4) Analyzer output (structured + markdown feedback)
        const analysis = await analyzeSession({
            userProfile: {
                role: userProfile.role,
                industry: userProfile.industry,
                goals: userProfile.goals,
                additionalContext: userProfile.additionalContext,
            },
            skillMemory: {
                strengths: skillMemory.strengths,
                weaknesses: skillMemory.weaknesses,
                recentFocus: skillMemory.recentFocus,
            },
            session: {
                plan: session.plan,
                transcript,
                humeContext: JSON.stringify(humeTrimmed),
            },
        });

        const feedback = await generateSessionFeedback(
            {
                userProfile: {
                    role: userProfile.role,
                    industry: userProfile.industry,
                    goals: userProfile.goals,
                    additionalContext: userProfile.additionalContext,
                },
                skillMemory: {
                    strengths: skillMemory.strengths,
                    weaknesses: skillMemory.weaknesses,
                    recentFocus: skillMemory.recentFocus,
                },
                session: {
                    plan: session.plan,
                    transcript,
                    humeContext: JSON.stringify(humeTrimmed),
                },
            },
            { sessionAnalysis: analysis },
        );

        await sessionRef.set(
            {
                audioUrl,
                transcript,
                analysis,
                feedback,
            },
            { merge: true },
        );

        return NextResponse.json({
            ok: true,
            audioUrl,
            transcript,
            analysis,
            feedback,
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
