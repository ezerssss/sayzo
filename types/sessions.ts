/**
 * Default catalog for the planner (documented in `prompts/planner`); the model may
 * also emit new `snake_case` slugs when none of these fit.
 */
export const RECOMMENDED_SPEAKING_DRILL_CATEGORIES = [
    "presentation",
    "status_update",
    "demo_walkthrough",
    "meeting_contribution",
    "impromptu",
    "interview_behavioral",
    "interview_situational",
    "self_introduction",
    "personal_reflection",
    "difficult_conversation",
    "stakeholder_alignment",
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
    framework: string; // Recommended speaking framework/structure for this context.
    /** Speaking-situation slug: prefer built-ins in `RECOMMENDED_SPEAKING_DRILL_CATEGORIES`, or a new concise snake_case slug. */
    category: string;
};

export type SessionPlanType = {
    scenario: ScenarioType;
    /** Primary user skill this drill aims to improve. */
    skillTarget: string;
    /** Maximum recording duration for this drill (seconds). */
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

export type SessionAnalysisType = {
    overview: string;
    mainIssue: string;
    secondaryIssues: string[];
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

export type SessionFeedbackType = {
    overview: string;
    momentsToTighten: string;
    structureAndFlow: string;
    clarityAndConciseness: string;
    relevanceAndFocus: string;
    engagement: string;
    professionalism: string;
    deliveryAndProsody: string;
    nativeSpeakerVersion: string | null;
    /** @deprecated Folded into overview. Kept for backward compat with old sessions. */
    betterOptions?: string | null;
    /** @deprecated Removed. Kept for backward compat with old sessions. */
    nextRepetition?: string;
    /** @deprecated Folded into overview. Kept for backward compat with old sessions. */
    whatWorkedWell?: string | null;
};

export function hasSessionFeedbackContent(
    feedback: SessionFeedbackType | null | undefined,
): boolean {
    if (!feedback) return false;
    return Object.values(feedback).some(
        (value) => typeof value === "string" && value.trim().length > 0,
    );
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

    createdAt: string;
};
