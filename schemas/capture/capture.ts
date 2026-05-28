import type { CaptureTranscriptLine } from "@/schemas/shared/transcript";
import type { ItemAnalysis } from "@/schemas/analysis/item-analysis";

export type CaptureStatus =
    | "queued"
    | "transcribing"
    | "transcribed"
    | "validating"
    | "validated"
    | "rejected"
    | "analyzing"
    | "profiling"
    | "analyzed"
    | "transcribe_failed"
    | "validate_failed"
    | "analyze_failed"
    | "profile_failed";

export type CaptureCloseReason = "joint_silence" | "safety_cap" | "shutdown";

export type CaptureType = {
    /** Firestore document ID — mapped from `doc.id`, not stored as a field. */
    id?: string;
    uid: string;

    status: CaptureStatus;
    rejectionReason: string | null;
    uploadedAt: string;
    error?: string | null;
    retryCount?: number;

    agentRecordId: string;
    startedAt: string;
    endedAt: string;
    /**
     * UI title until `serverTitle` arrives. Synthesized at upload as
     * `Capture · YYYY-MM-DD HH:MM`. Old agents may have set a local-LLM title.
     */
    title: string;
    /** UI summary until `serverSummary` arrives. Empty at upload. */
    summary: string;
    closeReason: CaptureCloseReason;
    audioStoragePath: string;

    serverTranscript?: CaptureTranscriptLine[];
    serverTitle?: string;
    serverSummary?: string;
    durationSecs?: number;

    /**
     * Count of channel-0 Deepgram utterances dropped as echo leaks during server
     * re-transcription, with the dropped time ranges and the detector tuning
     * version. See `lib/captures/echo-leak.ts`.
     */
    echoLeakSuppressed?: number;
    echoLeakDroppedSpans?: { start: number; end: number }[];
    echoLeakRuleVersion?: string;

    /** ISO 8601 — set when status first reaches `analyzed`. Enables measuring
     *  upload→analyzed latency (p50/p95) for sizing the desktop agent's poll. */
    analyzedAt?: string;

    /** Unified per-item analysis (shared with drills). Captures fill the common
     *  fields + dimensions + conversation-only fields (turnRewrites, metrics). */
    analysis?: ItemAnalysis;
};
