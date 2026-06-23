import type { CaptureTranscriptLine } from "@/schemas/shared/transcript";
import type { ItemAnalysis } from "@/schemas/analysis/item-analysis";
import type { MeetingSummary } from "@/schemas/capture/meeting-summary";
import type { TranscriptCorrection } from "@/schemas/capture/transcript-correction";

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
     * True when only the user's side was captured — `serverTranscript` has user
     * lines and no other-speaker (`other_*`) lines (a phone call / in-person
     * meeting where only the mic was on, or deliberate solo practice). Inferred
     * server-side in `runTranscription`; relaxes the validation gates and
     * reframes feedback to coach the user's own speaking. Absent on old docs
     * (treated as two-sided).
     */
    isOneSided?: boolean;

    /**
     * User-submitted mishearing fixes (overlay — `serverTranscript` is never
     * mutated). Applied at display/read time via `lib/captures/corrections.ts`.
     * Capped at MAX_CORRECTIONS_PER_CAPTURE; server is the only writer.
     */
    transcriptCorrections?: TranscriptCorrection[];

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

    /**
     * Structured actionable notes (TL;DR, action items, deadlines) generated
     * best-effort alongside deep analysis. Absent on legacy captures and when
     * generation failed — the UI hides the Summary tab then. Never regenerated
     * on transcript corrections (same stance as `analysis`).
     */
    meetingSummary?: MeetingSummary;
};
