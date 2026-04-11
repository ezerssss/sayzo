import "server-only";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type { CaptureStatus, CaptureType } from "@/types/captures";

import { analyzeCaptureDeep } from "./analyze";
import { generateDrillsFromCapture } from "./drills";
import { updateUserProfileFromCapture } from "./profile";
import { retranscribeCapture } from "./transcribe";
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

    const { serverTranscript, durationSecs } = await retranscribeCapture(
        audioBuffer,
        capture.agentTranscript,
    );

    await captureRef.set(
        {
            status: "transcribed",
            serverTranscript,
            durationSecs,
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

    // Stage 3: Deep Analysis
    await captureRef.set({ status: "analyzing" }, { merge: true });

    const transcript = capture.serverTranscript ?? capture.agentTranscript;
    const durationSecs = capture.durationSecs ?? 0;

    const { serverTitle, serverSummary, analysis } = await analyzeCaptureDeep(
        transcript,
        capture.title,
        capture.summary,
        durationSecs,
    );

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
