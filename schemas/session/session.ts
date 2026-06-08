import type { CaptureTranscriptLine } from "@/schemas/shared/transcript";
import type {
    ItemAnalysis,
    SessionFeedbackType,
} from "@/schemas/analysis/item-analysis";

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
    /** Speaking-situation slug (snake_case), derived from the source conversation by the replay planner. */
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

    /**
     * Origin discriminator. Every session is now a replay of a captured real
     * conversation (standalone drill generation was removed), so this is always
     * `"scenario_replay"` on new docs. Legacy docs may carry the old `"drill"`
     * value or none; nothing reads it anymore, so the stale value stays inert.
     */
    type?: "scenario_replay";

    createdAt: string;
};
