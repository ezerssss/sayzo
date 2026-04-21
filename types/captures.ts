import type { HumeExpressionSummary } from "@/types/hume-expression";

export type CaptureTranscriptLine = {
    speaker: string; // "user", "other_1", "other_2", "other_unmic", etc.
    start: number; // seconds into conversation
    end: number;
    text: string;
};

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

export type TeachableMomentType =
    | "grammar"
    | "filler"
    | "phrasing"
    | "vocabulary"
    | "communication";

export type TeachableMomentSeverity = "minor" | "moderate" | "major";

/**
 * The unified three-part teachable shape used across all coaching content
 * (fix-first, more-moments, dimensional `findings`). Mirrors the drill side's
 * `session-feedback` "teachable moment format".
 *
 * Every part is required because each does distinct work:
 * - `anchor` grounds the feedback in evidence (without it, feedback is generic)
 * - `betterOption` gives a target to aim for (without it, the learner has nothing concrete to copy)
 * - `whyThisMatters` explains the cost AND a reusable principle the learner
 *   can apply to future situations. Merges the old `whyIssue` + `keyTakeaway`
 *   fields into one single narrative so the UI can show one toggle instead of
 *   two separate labels.
 */
export type CoachingMoment = {
    /** What the user actually did. Quote when possible, otherwise tight paraphrase. Include conversational context (e.g. "When the PM asked about the timeline, you said..."). */
    anchor: string;
    /** Concrete better alternative — exact wording when possible, or a specific structural / delivery change. */
    betterOption: string;
    /** Why this is an issue for the listener / goal / professional impact AND a reusable principle the learner can apply to future situations. One cohesive explanation — the single "Why this matters" field. */
    whyThisMatters: string;
    /** @deprecated Merged into `whyThisMatters`. Kept so legacy analyses persisted before the schema change still render. */
    whyIssue?: string;
    /** @deprecated Merged into `whyThisMatters`. Kept so legacy analyses persisted before the schema change still render. */
    keyTakeaway?: string;
};

/**
 * Specific coachable moment with type/severity classification on top of the
 * standard `CoachingMoment` shape. Lives in the `fixTheseFirst` and
 * `moreMoments` arrays on `CaptureAnalysis`.
 */
export type TeachableMoment = CoachingMoment & {
    type: TeachableMomentType;
    severity: TeachableMomentSeverity;
    timestamp: number;
    transcriptIdx: number;
};

export type GrammarPattern = {
    pattern: string;
    frequency: number;
    examples: { transcriptIdx: number; text: string }[];
};

export type VocabularyAssessment = {
    uniqueWords: number;
    sophisticationScore: number;
    overusedSimpleWords: {
        word: string;
        count: number;
        alternatives: string[];
    }[];
    domainVocabulary: string[];
};

export type FillerWordBreakdownEntry = {
    word: string;
    count: number;
};

export type FillerWordAnalysis = {
    totalCount: number;
    perMinute: number;
    breakdown: FillerWordBreakdownEntry[];
    timestamps: number[];
};

export type FluencyMetrics = {
    wordsPerMinute: number;
    avgPauseDurationMs: number;
    selfCorrections: number;
    avgResponseLatencyMs: number;
};

export type CommunicationStyle = {
    directness: number; // 0-1
    formality: number; // 0-1
    confidence: number; // 0-1
    turnTaking: "balanced" | "passive" | "dominant";
};

/**
 * Each dimensional finding (structure, clarity, relevance, engagement,
 * professionalism, voice/tone) gets a paragraph-level macro `assessment`
 * plus an array of specific `findings`. Each finding follows the four-part
 * `CoachingMoment` shape so the learner gets full coaching depth on every
 * specific moment, not just labels.
 *
 * This mirrors the drill `session-feedback` prompt — the drill side splits
 * "analyzer" (structured) from "feedback" (rich narrative) into two prompts;
 * captures fold both responsibilities into one analysis pass, so assessment +
 * structured findings gives the LLM space for both at once.
 */
export type DimensionalAnalysis = {
    /** 2-4 sentence paragraph evaluating this dimension at a macro level. May include "what the user did vs what would have been better" framing where useful. */
    assessment: string;
    /** Specific coachable moments — each follows the four-part `CoachingMoment` shape (anchor, whyIssue, betterOption, keyTakeaway). Empty array when nothing specific to flag beyond the assessment. */
    findings: CoachingMoment[];
};

/**
 * Model's verdict for one user turn. Drives UI rendering and tells the learner
 * at a glance whether a turn already worked or needs attention.
 *
 * - `keep`:    already strong; `rewrite` may equal `original`
 * - `tighten`: same intent, fewer or cleaner words
 * - `sharpen`: same intent, stronger word choice / phrasing
 * - `reframe`: meaningfully different structure within the turn
 * - `reorder`: this turn belonged elsewhere in the conversation
 */
export type RewriteVerdict =
    | "keep"
    | "tighten"
    | "sharpen"
    | "reframe"
    | "reorder";

/**
 * How a fluent native speaker would have said one user turn. Unlike the drill
 * side's single prose `nativeSpeakerVersion`, captures are turn-indexed:
 * every user turn gets its own entry (even `keep` ones) so there are never
 * unexplained gaps and the per-turn view is the single source of truth. The
 * "read straight through" experience is derived in the UI by stitching these
 * entries together — no separate prose field exists.
 */
export type TurnRewrite = {
    /** Index in `serverTranscript` (or `agentTranscript` fallback) — must point at a user-tagged line. */
    transcriptIdx: number;
    /** The user's exact words from that turn, denormalized so the UI doesn't re-resolve against the transcript. */
    original: string;
    /** How a fluent native English speaker would have phrased the same message in the same conversational context. When `verdict === "keep"`, may equal `original`. */
    rewrite: string;
    /** One-word verdict that drives the pill + layout in the UI. */
    verdict: RewriteVerdict;
    /** 1-2 sentences: what changed and why it works better. Null only when `verdict === "keep"` and no coaching insight applies; `keep` turns may still carry a short note like "good concrete example — no change needed". */
    note: string | null;
    /** Only meaningful when `verdict === "reorder"`: the `transcriptIdx` this turn would logically have preceded. `null` for every other verdict. Lets the UI draw an anchor chip. */
    suggestedBeforeIdx: number | null;
};

/**
 * Cross-turn observation about how the conversation could have been sequenced
 * or framed. Captures the "reorganization" value the old prose rewrite tried
 * (and failed) to carry inline — now it's structured, anchored to specific
 * turns, and rendered as its own panel.
 */
export type StructuralObservation = {
    /** One-sentence headline, e.g. "You answered before framing." */
    observation: string;
    /** 1-3 sentences with reasoning. */
    explanation: string;
    /** Which user turns this observation touches; renders as clickable chips. */
    affectedTurnIdxs: number[];
};

/**
 * Deep analysis of a captured conversation. Combines:
 *
 * - **Dimensional findings** (overview, mainIssue, structureAndFlow, …)
 *   borrowed from the drill `SessionAnalysisType` so the same coaching
 *   surface area is available for captures.
 * - **Quantitative metrics** (vocabulary, fillerWords, fluency, etc.)
 *   that are unique to captures because real conversations are long
 *   enough to show meaningful patterns.
 * - **Teachable moments** — concrete, citation-anchored coaching points
 *   the learner can act on.
 *
 * `voiceToneExpression` is grounded in Hume prosody/burst/language signals
 * (see `humeExpression` on `CaptureType`).
 */
export type CaptureAnalysis = {
    // High-level synthesis (dimensional, mirrors SessionAnalysisType)
    overview: string;
    mainIssue: string;
    secondaryIssues: string[];
    notes: string;

    // Dimensional findings — each has a paragraph-level macro assessment
    // plus a bullet array of specific findings. See `DimensionalAnalysis`.
    structureAndFlow: DimensionalAnalysis;
    clarityAndConciseness: DimensionalAnalysis;
    relevanceAndFocus: DimensionalAnalysis;
    engagement: DimensionalAnalysis;
    professionalism: DimensionalAnalysis;
    /** Hume-grounded delivery findings: pace, rhythm, intonation, vocal bursts, emotional tone. */
    voiceToneExpression: DimensionalAnalysis;

    // Progress tracking (vs prior strengths/weaknesses on the user)
    improvements: string[];
    regressions: string[];

    /**
     * Top-priority coachable moments — the ones the learner should fix first.
     * The LLM decides which moments earn a slot here based on impact, severity,
     * and how much of the overall issue they represent. Typically 2-4.
     */
    fixTheseFirst: TeachableMoment[];
    /**
     * Additional coachable moments beyond the top priorities. Shown as a
     * secondary list so the learner can explore more feedback without being
     * overwhelmed up-front.
     */
    moreMoments: TeachableMoment[];
    /** @deprecated Split into `fixTheseFirst` + `moreMoments`. Kept so legacy analyses persisted before the schema change still render. */
    teachableMoments?: TeachableMoment[];

    // Pattern detection unique to captures (drills are too short for these
    // metrics to be meaningful)
    grammarPatterns: GrammarPattern[];
    vocabulary: VocabularyAssessment;
    fillerWords: FillerWordAnalysis;
    fluency: FluencyMetrics;
    communicationStyle: CommunicationStyle;

    /**
     * One entry per user turn, in transcript order. Length equals the count
     * of `speaker === "user"` lines in the transcript. Turns that already
     * worked use `verdict: "keep"` rather than being omitted — the UI shows
     * them as compact "already strong" rows so coverage is visible.
     *
     * Replaces the old `nativeSpeakerRewrites` (curated 5-10 turns) and
     * `nativeSpeakerVersion` (single prose block) fields. The "read straight
     * through" view is derived in the UI from this array — there is no
     * separate prose rewrite.
     */
    turnRewrites: TurnRewrite[];

    /**
     * Up to four cross-turn observations about how the conversation could
     * have been sequenced or framed. Replaces the reorganization value the
     * old prose rewrite tried to carry ("you could have led with X").
     * Empty array is valid.
     */
    structuralObservations: StructuralObservation[];
};

export type CaptureType = {
    /** Firestore document ID. Not stored as a field in the document — mapped
     *  from `doc.id` when reading from Firestore snapshots. */
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
    title: string;
    summary: string;
    agentTranscript: CaptureTranscriptLine[];
    relevantSpan: [number, number];
    closeReason: CaptureCloseReason;
    audioStoragePath: string;

    serverTranscript?: CaptureTranscriptLine[];
    serverTitle?: string;
    serverSummary?: string;
    durationSecs?: number;

    /**
     * Count of channel-0 Deepgram utterances dropped as echo leaks during
     * server re-transcription. Paired with `echoLeakDroppedSpans` for the
     * actual time ranges. `echoLeakRuleVersion` records which tuning of the
     * detector produced the drop so analytics stay comparable across tuning
     * passes. See `lib/captures/echo-leak.ts`.
     */
    echoLeakSuppressed?: number;
    echoLeakDroppedSpans?: [number, number][];
    echoLeakRuleVersion?: string;

    /**
     * Trimmed Hume expression measurement (prosody + bursts + language).
     * Stored on the capture so the analyzer can be re-run later without
     * paying for another Hume batch job.
     */
    humeExpression?: HumeExpressionSummary;

    analysis?: CaptureAnalysis;
};
