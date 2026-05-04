import type { SessionPlanType } from "@/types/sessions";

/**
 * Bite-sized drill format: a single 60-second response. Both the default
 * and the hard cap are 60s — the planner can never request more, the UI
 * auto-stops the recorder at 60s.
 */
export const DEFAULT_MAX_SECONDS = 60;
export const HARD_MAX_SECONDS = 60;
export const MIN_MAX_SECONDS = 30;
export const EMPTY_CAPTIONS_VTT = "data:text/vtt,WEBVTT";

export const FALLBACK_PLAN: SessionPlanType = {
    scenario: {
        title: "Quick status update",
        question:
            "What are you working on this week, and where are you stuck?",
        category: "status_update",
    },
    skillTarget: "Concise structure",
    maxDurationSeconds: DEFAULT_MAX_SECONDS,
};
