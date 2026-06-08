import "server-only";

import { FirestoreCollections } from "@/schemas";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import { getOrHydrateLearnerModel } from "@/lib/learner-model/store";
import type { CaptureStatus, CaptureType } from "@/schemas";
import type { UserProfileType } from "@/schemas";

import { analyzeCaptureDeep } from "./analyze";
import { updateUserProfileFromCapture } from "./profile";
import { generateQuickSummary } from "./quick-summary";
import { transcribeCapture } from "./transcribe";
import { validateCaptureRelevance } from "./validate";

const MAX_RETRIES = 3;

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
// Stage 1: Transcription
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
    } = await transcribeCapture(audioBuffer);

    // Generate a quick title/summary from the fresh Deepgram transcript so the
    // UI can replace the synthesized placeholder set at upload time. Best-effort:
    // if it fails, keep the placeholder and let the deep analysis stage produce
    // the final serverTitle/serverSummary.
    let quickTitle: string | null = null;
    let quickSummary: string | null = null;
    if (serverTranscript.length > 0) {
        try {
            const quick = await generateQuickSummary({
                transcript: serverTranscript,
                closeReason: capture.closeReason,
                durationSecs,
            });
            quickTitle = quick.title;
            quickSummary = quick.summary;
        } catch (err) {
            console.warn(
                `[captures/process] Quick summary failed for ${captureId}, keeping placeholder until deep analysis runs`,
                err,
            );
        }
    }

    await captureRef.set(
        {
            status: "transcribed",
            serverTranscript,
            durationSecs,
            echoLeakSuppressed,
            echoLeakDroppedSpans,
            echoLeakRuleVersion,
            ...(quickTitle ? { serverTitle: quickTitle } : {}),
            ...(quickSummary != null ? { serverSummary: quickSummary } : {}),
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

    const transcript = capture.serverTranscript ?? [];

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
// Stages 3 + 4: Analysis → Profiling
// ---------------------------------------------------------------------------

async function runAnalysisAndProfiling(
    captureId: string,
    capture: CaptureType,
): Promise<ProcessResult> {
    const db = getAdminFirestore();
    const captureRef = db
        .collection(FirestoreCollections.captures.path)
        .doc(captureId);

    // Stage 3: Deep Analysis (LLM)
    await captureRef.set({ status: "analyzing" }, { merge: true });

    const transcript = capture.serverTranscript ?? [];
    const durationSecs = capture.durationSecs ?? 0;

    // Load user profile + skill memory for analysis calibration
    const [userSnap, model] = await Promise.all([
        db.collection(FirestoreCollections.users.path).doc(capture.uid).get(),
        getOrHydrateLearnerModel(db, capture.uid),
    ]);
    const userProfile = (userSnap.data() ?? {}) as Partial<UserProfileType>;

    // Recent analyzed captures' headlines so the capture analyzer is differential.
    const recentCapturesSnap = await db
        .collection(FirestoreCollections.captures.path)
        .where("uid", "==", capture.uid)
        .orderBy("startedAt", "desc")
        .limit(10)
        .get();
    const differential = {
        trackedPatterns: model.trackedPatterns,
        recentMainIssues: recentCapturesSnap.docs
            .filter((d) => d.id !== captureId)
            .map((d) => ({ id: d.id, data: d.data() as CaptureType }))
            .filter((x) => x.data.analysis?.mainIssue)
            .slice(0, 5)
            .map((x) => ({
                sourceId: x.id,
                mainIssue: x.data.analysis!.mainIssue,
                createdAt: x.data.startedAt,
            })),
    };

    const { serverTitle, serverSummary, analysis } = await analyzeCaptureDeep({
        transcript,
        agentTitle: capture.title,
        agentSummary: capture.summary,
        durationSecs,
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
            strengths: model.strengths,
            weaknesses: model.weaknesses,
            masteredFocus: model.masteredFocus,
            reinforcementFocus: model.reinforcementFocus,
        },
        differential,
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

    // Mark complete
    await captureRef.set(
        {
            status: "analyzed",
            analyzedAt: new Date().toISOString(),
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

    const transcript = capture.serverTranscript ?? [];

    await updateUserProfileFromCapture(
        capture.uid,
        captureId,
        transcript,
        capture.analysis,
        capture.serverTitle ?? capture.title,
        capture.serverSummary ?? capture.summary,
    );

    await captureRef.set(
        {
            status: "analyzed",
            analyzedAt: new Date().toISOString(),
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
