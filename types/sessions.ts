import type {
    CaptureTranscriptLine,
    TeachableMoment,
} from "@/types/captures";

/**
 * Default catalog for the planner (documented in `prompts/planner`); the model may
 * also emit new `snake_case` slugs when none of these fit.
 */
export const RECOMMENDED_SPEAKING_DRILL_CATEGORIES = [
    "status_update",
    "project_walkthrough",
    "stakeholder_alignment",
    "difficult_conversation",
    "self_introduction",
    "personal_reflection",
    "interview_behavioral",
    "interview_situational",
] as const;

/** Normalize user/model text into a single stored slug (snake_case). */
export function toDrillCategorySlug(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "_")
        .replaceAll(/_+/g, "_")
        .replaceAll(/^_+|_+$/g, "");
}

export type ScenarioType = {
    title: string;
    situationContext: string;
    givenContent: string; // Specific details of the situation that are relevant to the session.
    /** The actual question or prompt the learner must respond to, written in second person as if the interviewer/audience is asking them directly. */
    question?: string;
    /** Optional one-line speaking hint. Empty string when the prompt is self-explanatory; never a multi-step list. */
    framework: string;
    /** Speaking-situation slug: prefer built-ins in `RECOMMENDED_SPEAKING_DRILL_CATEGORIES`, or a new concise snake_case slug. */
    category: string;
};

export type SessionPlanType = {
    scenario: ScenarioType;
    /** Primary user skill this drill aims to improve. */
    skillTarget: string;
    /** Maximum recording duration for this drill (seconds). 60s for the new bite-sized drill shape. */
    maxDurationSeconds: number;
};

/**
 * One row per past drill passed into the planner (newest first) so it can rotate
 * categories and scenarios without repeating the same shape every time.
 */
export type PlannerRecentDrillSummary = {
    category: string;
    scenarioTitle: string;
    skillTarget: string;
};

/**
 * Internal AI analysis of a finished drill. Stays rich — feeds the planner's
 * skill memory, learner-context updater, focus dashboard, and replay
 * comparison. The user-facing surface is a thin projection over this object;
 * see `SessionFeedbackType` (which now only carries the polished rewrite).
 */
export type SessionAnalysisType = {
    overview: string;
    mainIssue: string;
    secondaryIssues: string[];
    /**
     * Top 2-3 ranked coachable moments — what the learner sees in the new
     * "Fix these first" card on the feedback page. Reuses the captures-side
     * `TeachableMoment` shape so the same renderer covers both surfaces.
     */
    fixTheseFirst: TeachableMoment[];
    structureAndFlow: string[];
    clarityAndConciseness: string[];
    relevanceAndFocus: string[];
    engagement: string[];
    professionalism: string[];
    voiceToneExpression: string[];
    improvements: string[];
    regressions: string[];
    notes: string;
};

/**
 * User-facing feedback — collapsed to just the polished rewrite. The
 * "Main Issue + Fix These First" card on the new feedback page reads
 * directly from `SessionAnalysisType` (one source of truth). Any
 * structured coaching content lives on the analysis object; this type
 * carries the prose rewrite the user reads on Tab 2 ("Improved Version").
 */
export type SessionFeedbackType = {
    /** Renamed from `nativeSpeakerVersion`. Full rewrite of the user's drill response with `> **Note:**` annotations after each paragraph explaining what changed and why. Null when transcript was unusable. */
    improvedVersion: string | null;
};

export function hasSessionFeedbackContent(
    feedback: SessionFeedbackType | null | undefined,
): boolean {
    return Boolean(feedback?.improvedVersion?.trim());
}

export type SessionCompletionStatus =
    | "pending"
    | "passed"
    | "needs_retry"
    | "skipped";

export type SessionType = {
    id: string;
    uid: string;

    plan: SessionPlanType;

    audioUrl: string | null;
    audioObjectPath?: string | null;
    transcript: string | null;
    /**
     * Structured per-utterance transcript (one line per Deepgram utterance)
     * with start/end timings and `speaker: "user"` on every line (drills are
     * monologues). Reuses the capture transcript shape so one renderer can
     * serve both surfaces.
     */
    serverTranscript?: CaptureTranscriptLine[] | null;

    analysis: SessionAnalysisType | null;
    feedback: SessionFeedbackType | null;
    completionStatus: SessionCompletionStatus;
    completionReason: string | null;

    processingStatus?: "idle" | "processing" | "failed";
    processingStage?:
        | "starting"
        | "transcribing"
        | "uploading"
        | "analyzing_expression"
        | "analyzing"
        | "combining"
        | null;
    processingJobId?: string | null;
    processingError?: string | null;
    processingUpdatedAt?: string;

    /**
     * When this session was created from a captured real conversation via
     * the "Practice this conversation" flow, this points at `captures/{id}`.
     * The original capture is never modified — the replay is a separate
     * session record with this back-link for traceability and so the
     * analyzer can load it for comparison feedback.
     */
    sourceCaptureId?: string;

    /**
     * Session origin discriminator. Defaults to `"drill"` when absent so
     * existing sessions remain valid without migration. `"scenario_replay"`
     * means the session was created from a capture and the analyzer should
     * compare the user's new attempt against the original.
     */
    type?: "drill" | "scenario_replay";

    createdAt: string;
};
