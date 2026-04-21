import "server-only";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import { measureSessionExpression } from "@/services/hume-expression";
import type {
    CaptureStatus,
    CaptureTranscriptLine,
    CaptureType,
} from "@/types/captures";
import type { HumeExpressionSummary } from "@/types/hume-expression";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

import { analyzeCaptureDeep } from "./analyze";
import { extractUserChannel } from "./audio";
import { generateDrillsFromCapture } from "./drills";
import { updateUserProfileFromCapture } from "./profile";
import { retranscribeCapture } from "./transcribe";
import { validateCaptureRelevance } from "./validate";

const MAX_RETRIES = 3;
const HUME_JOB_TIMEOUT_SECS = 900; // 15 min — captures can be up to 60 min long

/** Statuses where the next processing stage should run. */
const PROCESSABLE_STATUSES: CaptureStatus[] = [
    "queued",
    "transcribed",
    "validated",
    "transcribe_failed",
    "validate_failed",
    "analyze_failed",
    "profile_failed",
];

export type ProcessResult = {
    captureId: string;
    previousStatus: CaptureStatus;
    newStatus: CaptureStatus;
    error?: string;
};

/**
 * Find the oldest capture that needs processing and run its next stage.
 * Returns null when there is nothing to process.
 *
 * NOTE: The query `where("status", "in", ...).orderBy("uploadedAt")`
 * requires a Firestore composite index on `(status, uploadedAt)` for
 * the `captures` collection. Create it in the Firebase console or via
 * the link Firestore prints in the server logs on first query.
 */
export async function processNextCapture(): Promise<ProcessResult | null> {
    const db = getAdminFirestore();
    const capturesRef = db.collection(FirestoreCollections.captures.path);

    const snap = await capturesRef
        .where("status", "in", PROCESSABLE_STATUSES)
        .orderBy("uploadedAt", "asc")
        .limit(1)
        .get();

    if (snap.empty) return null;

    const doc = snap.docs[0]!;
    const capture = doc.data() as CaptureType;
    const captureId = doc.id;
    const previousStatus = capture.status;

    // Skip failed captures that exhausted retries
    if (previousStatus.endsWith("_failed")) {
        const retryCount = capture.retryCount ?? 0;
        if (retryCount >= MAX_RETRIES) {
            return null;
        }
    }

    try {
        switch (previousStatus) {
            case "queued":
            case "transcribe_failed":
                return await runTranscription(captureId, capture);
            case "transcribed":
            case "validate_failed":
                return await runValidation(captureId, capture);
            case "validated":
            case "analyze_failed":
                return await runAnalysisAndProfiling(captureId, capture);
            case "profile_failed":
                return await runProfilingOnly(captureId, capture);
            default:
                return null;
        }
    } catch (error) {
        const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
        const failedStatus = getFailedStatus(previousStatus);
        const retryCount = (capture.retryCount ?? 0) + 1;

        console.error(
            `[captures/process] Stage failed for ${captureId} (${previousStatus}):`,
            errorMsg,
        );

        await capturesRef.doc(captureId).set(
            {
                status: failedStatus,
                error: errorMsg,
                retryCount,
            },
            { merge: true },
        );

        return {
            captureId,
            previousStatus,
            newStatus: failedStatus,
            error: errorMsg,
        };
    }
}

// ---------------------------------------------------------------------------
// Stage 1: Re-Transcription
// ---------------------------------------------------------------------------

async function runTranscription(
    captureId: string,
    capture: CaptureType,
): Promise<ProcessResult> {
    const db = getAdminFirestore();
    const captureRef = db
        .collection(FirestoreCollections.captures.path)
        .doc(captureId);

    await captureRef.set({ status: "transcribing" }, { merge: true });

    // Download audio from Cloud Storage
    const bucket = getAdminStorageBucket();
    const file = bucket.file(capture.audioStoragePath);
    const [audioBuffer] = await file.download();

    const {
        serverTranscript,
        durationSecs,
        echoLeakSuppressed,
        echoLeakDroppedSpans,
        echoLeakRuleVersion,
    } = await retranscribeCapture(audioBuffer, capture.agentTranscript);

    await captureRef.set(
        {
            status: "transcribed",
            serverTranscript,
            durationSecs,
            echoLeakSuppressed,
            echoLeakDroppedSpans,
            echoLeakRuleVersion,
            error: null,
        },
        { merge: true },
    );

    return {
        captureId,
        previousStatus: capture.status,
        newStatus: "transcribed",
    };
}

// ---------------------------------------------------------------------------
// Stage 2: Relevance Validation
// ---------------------------------------------------------------------------

async function runValidation(
    captureId: string,
    capture: CaptureType,
): Promise<ProcessResult> {
    const db = getAdminFirestore();
    const captureRef = db
        .collection(FirestoreCollections.captures.path)
        .doc(captureId);

    await captureRef.set({ status: "validating" }, { merge: true });

    // Use server transcript if available, fall back to agent transcript
    const transcript = capture.serverTranscript ?? capture.agentTranscript;

    const { accepted, rejectionReason } = await validateCaptureRelevance(
        transcript,
        capture.title,
        capture.summary,
    );

    if (!accepted) {
        await captureRef.set(
            {
                status: "rejected",
                rejectionReason,
                error: null,
            },
            { merge: true },
        );

        return {
            captureId,
            previousStatus: capture.status,
            newStatus: "rejected",
        };
    }

    await captureRef.set(
        {
            status: "validated",
            rejectionReason: null,
            error: null,
        },
        { merge: true },
    );

    return {
        captureId,
        previousStatus: capture.status,
        newStatus: "validated",
    };
}

// ---------------------------------------------------------------------------
// Stages 3 + 4 + 5: Analysis → Profiling → Drills
// ---------------------------------------------------------------------------

async function runAnalysisAndProfiling(
    captureId: string,
    capture: CaptureType,
): Promise<ProcessResult> {
    const db = getAdminFirestore();
    const captureRef = db
        .collection(FirestoreCollections.captures.path)
        .doc(captureId);

    // Stage 3: Deep Analysis (Hume + LLM)
    await captureRef.set({ status: "analyzing" }, { merge: true });

    const transcript = capture.serverTranscript ?? capture.agentTranscript;
    const durationSecs = capture.durationSecs ?? 0;

    // Run Hume — required for the voiceToneExpression dimension. If it fails,
    // continue without it; the analyzer prompt has a fallback for missing Hume.
    let humeExpression: HumeExpressionSummary | null = capture.humeExpression
        ? capture.humeExpression
        : null;
    if (!humeExpression) {
        try {
            // Download stereo capture audio and extract the user's channel
            // (left = mic) before sending to Hume. This guarantees prosody
            // and burst signals are user-only — no contamination from the
            // other side of the call.
            const bucket = getAdminStorageBucket();
            const file = bucket.file(capture.audioStoragePath);
            const [stereoBuffer] = await file.download();
            const userOnlyAudio = await extractUserChannel(stereoBuffer);

            humeExpression = await measureCaptureUserExpression(
                userOnlyAudio,
                transcript,
            );
            await captureRef.set({ humeExpression }, { merge: true });
        } catch (humeError) {
            console.warn(
                `[captures/process] Hume measurement failed for ${captureId}, continuing without delivery signals:`,
                humeError,
            );
            humeExpression = null;
        }
    }

    // Load user profile + skill memory for analysis calibration
    const [userSnap, skillSnap] = await Promise.all([
        db.collection(FirestoreCollections.users.path).doc(capture.uid).get(),
        db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(capture.uid)
            .get(),
    ]);
    const userProfile = (userSnap.data() ?? {}) as Partial<UserProfileType>;
    const skillData = (skillSnap.data() ?? {}) as Partial<SkillMemoryType>;

    const { serverTitle, serverSummary, analysis } = await analyzeCaptureDeep({
        transcript,
        agentTitle: capture.title,
        agentSummary: capture.summary,
        durationSecs,
        humeExpression,
        userProfile: {
            role: userProfile.role ?? "",
            industry: userProfile.industry ?? "",
            companyName: userProfile.companyName ?? "",
            companyDescription: userProfile.companyDescription ?? "",
            workplaceCommunicationContext:
                userProfile.workplaceCommunicationContext ?? "",
            motivation: userProfile.motivation ?? "",
            goals: Array.isArray(userProfile.goals) ? userProfile.goals : [],
            additionalContext: userProfile.additionalContext ?? "",
        },
        skillMemory: {
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
        },
    });

    await captureRef.set(
        {
            serverTitle,
            serverSummary,
            analysis,
            error: null,
        },
        { merge: true },
    );

    // Stage 4: User Profiling
    await captureRef.set({ status: "profiling" }, { merge: true });

    await updateUserProfileFromCapture(
        capture.uid,
        captureId,
        transcript,
        analysis,
        serverTitle,
        serverSummary,
    );

    // Stage 5: Drill Generation (no-op for now)
    await generateDrillsFromCapture();

    // Mark complete
    await captureRef.set(
        {
            status: "analyzed",
            error: null,
        },
        { merge: true },
    );

    return {
        captureId,
        previousStatus: capture.status,
        newStatus: "analyzed",
    };
}

/**
 * Resume from Stage 4 only — analysis data already exists on the document.
 */
async function runProfilingOnly(
    captureId: string,
    capture: CaptureType,
): Promise<ProcessResult> {
    const db = getAdminFirestore();
    const captureRef = db
        .collection(FirestoreCollections.captures.path)
        .doc(captureId);

    if (!capture.analysis) {
        throw new Error(
            "Cannot run profiling: analysis data missing on capture",
        );
    }

    await captureRef.set({ status: "profiling" }, { merge: true });

    const transcript = capture.serverTranscript ?? capture.agentTranscript;

    await updateUserProfileFromCapture(
        capture.uid,
        captureId,
        transcript,
        capture.analysis,
        capture.serverTitle ?? capture.title,
        capture.serverSummary ?? capture.summary,
    );

    await generateDrillsFromCapture();

    await captureRef.set(
        {
            status: "analyzed",
            error: null,
        },
        { merge: true },
    );

    return {
        captureId,
        previousStatus: capture.status,
        newStatus: "analyzed",
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run Hume expression measurement on user-only capture audio.
 *
 * The audio passed in must already be the user's channel (left = mic)
 * extracted via `extractUserChannel`. With user-only audio:
 * - Prosody signals are pure user delivery (no other speakers)
 * - Burst signals are user-only (no laughs/sighs from other speakers)
 * - Language model only sees user text (filtered here)
 *
 * Result: Hume payload is fully user-only across all three models, with
 * zero contamination from the other side of the call.
 */
async function measureCaptureUserExpression(
    userAudioBuffer: Buffer,
    transcript: CaptureTranscriptLine[],
): Promise<HumeExpressionSummary> {
    const userText = transcript
        .filter((l) => l.speaker === "user")
        .map((l) => l.text)
        .join(" ")
        .trim();

    if (!userText) {
        throw new Error("Hume requires non-empty user speech");
    }

    return measureSessionExpression(
        {
            audio: new Uint8Array(userAudioBuffer),
            transcript: userText,
            filename: "capture-user.wav",
            contentType: "audio/wav",
        },
        { jobTimeoutSeconds: HUME_JOB_TIMEOUT_SECS },
    );
}

function getFailedStatus(currentStatus: CaptureStatus): CaptureStatus {
    switch (currentStatus) {
        case "queued":
        case "transcribing":
        case "transcribe_failed":
            return "transcribe_failed";
        case "transcribed":
        case "validating":
        case "validate_failed":
            return "validate_failed";
        case "validated":
        case "analyzing":
        case "analyze_failed":
            return "analyze_failed";
        case "profiling":
        case "profile_failed":
            return "profile_failed";
        default:
            return "analyze_failed";
    }
}
