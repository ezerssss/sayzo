import type { SessionFeedbackType, SessionPlanType } from "@/types/sessions";

export const DEFAULT_MAX_SECONDS = 5 * 60;
export const HARD_MAX_SECONDS = 30 * 60;
export const EMPTY_CAPTIONS_VTT = "data:text/vtt,WEBVTT";

/** Client-side chance to show post-drill reflection before creating the next session. */
export const REFLECTION_BEFORE_NEW_DRILL_PROBABILITY = 0.15;

export const FALLBACK_PLAN: SessionPlanType = {
    scenario: {
        title: "Practice Drill",
        situationContext:
            "You are giving a brief professional update to your team.",
        givenContent:
            "Summarize what changed, why it matters, and what you need from stakeholders.",
        framework:
            "Use PREP: Point -> Reason -> Example -> Point. Keep it concise and confident.",
        category: "status_update",
    },
    skillTarget: "Concise structure",
    maxDurationSeconds: DEFAULT_MAX_SECONDS,
};

export const FEEDBACK_SECTION_LABELS: Partial<
    Record<keyof SessionFeedbackType, string>
> = {
    overview: "Overview",
    momentsToTighten: "Moments",
    structureAndFlow: "Structure",
    clarityAndConciseness: "Clarity",
    relevanceAndFocus: "Relevance",
    engagement: "Engagement",
    professionalism: "Professionalism",
    deliveryAndProsody: "Voice & tone",
    nativeSpeakerVersion: "Improved Version",
};
