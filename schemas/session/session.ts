import type { CaptureTranscriptLine } from "@/schemas/shared/transcript";
import type {
    ItemAnalysis,
    SessionFeedbackType,
} from "@/schemas/analysis/item-analysis";

/**
 * Default catalog for the planner (documented in `prompts/planner`); the model
 * may also emit a new `snake_case` slug when none of these fit.
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
    /** The question/prompt the learner responds to, in second person. */
    question: string;
    /** Speaking-situation slug: a built-in from `RECOMMENDED_SPEAKING_DRILL_CATEGORIES` or a new concise snake_case slug. */
    category: string;
};

export type SessionPlanType = {
    scenario: ScenarioType;
    /**
     * Internal-only: the primary skill this drill trains. Read by the analyzer,
     * model updater, and the planner's recent-drills summary so feedback and
     * progression stay focused. Not surfaced in the UI today.
     */
    skillTarget: string;
    /** Max recording duration (seconds). 60s for the bite-sized drill shape. */
    maxDurationSeconds: number;
};

/**
 * One row per past drill passed into the planner (newest first) so it can
 * rotate categories and scenarios instead of repeating the same shape.
 */
export type PlannerRecentDrillSummary = {
    category: string;
    scenarioTitle: string;
    skillTarget: string;
};

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
     * Structured per-utterance transcript with `speaker: "user"` on every line
     * (drills are monologues). Reuses the capture transcript shape so one
     * renderer serves both surfaces.
     */
    serverTranscript?: CaptureTranscriptLine[] | null;

    /** Unified per-item analysis (shared with captures). Drills fill the common
     *  fields + dimensions + mainIssueShape/whatWentWell; conversation-only
     *  fields stay undefined. */
    analysis: ItemAnalysis | null;
    feedback: SessionFeedbackType | null;
    completionStatus: SessionCompletionStatus;
    completionReason: string | null;

    processingStatus?: "idle" | "processing" | "failed";
    processingStage?:
        | "starting"
        | "transcribing"
        | "uploading"
        | "analyzing"
        | "combining"
        | null;
    processingJobId?: string | null;
    processingError?: string | null;
    processingUpdatedAt?: string;

    /**
     * When this session is a replay of a captured real conversation, points at
     * `captures/{id}`. The original capture is never modified.
     */
    sourceCaptureId?: string;

    /** Origin discriminator. Defaults to `"drill"` when absent. */
    type?: "drill" | "scenario_replay";

    /**
     * ISO timestamp of the most recent drill page view (mount + 5-min
     * heartbeat). The pre-generator's `dailyRefresh` path skips mutate-in-place
     * when this is fresh so a reader never sees the brief change underneath them.
     */
    viewedAt?: string;

    createdAt: string;
};
