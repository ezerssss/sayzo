import type { TourPage } from "@/lib/analytics/events";
import type { TourStepId } from "@/schemas";

export type TourStepDef = {
    id: TourStepId;
    title: string;
    body: string;
};

const SHARED_STEPS = {
    improvedVersion: {
        id: "improved-version-tab",
        title: "Hear how it could sound",
        body: "This tab shows a stronger version of what you said, so you can compare it with your own take.",
    },
    discussFeedback: {
        id: "discuss-feedback",
        title: "Talk through any note",
        body: "Disagree with something, or want more detail? Open a quick chat with your coach about that piece of feedback.",
    },
} satisfies Record<string, TourStepDef>;

/**
 * Per-page page-guide steps, in tour order. Each step's target element
 * carries a matching `data-tour="<id>"` attribute; a step whose target is
 * absent or hidden at arm time is silently skipped (casual chat → no notes
 * bar, corrections maxed → no fix chip, retry only offered on passed takes).
 *
 * Steps teach INTERACTIONS, not static content — don't spotlight cards the
 * user will read anyway. Shared components reuse one id across pages, so
 * seeing the step anywhere counts everywhere.
 *
 * Adding a feature to these pages? Register an id in
 * `schemas/user/tour-steps.ts`, a def here, and a `data-tour` attribute on an
 * always-visible target — existing users then get it as a one-step
 * "what's new" spotlight automatically.
 */
export const TOUR_STEPS: Record<TourPage, TourStepDef[]> = {
    conversation: [
        {
            id: "meeting-notes",
            title: "Notes you can act on",
            body: "Sayzo writes up each conversation — decisions, to-dos, deadlines. Open this bar anytime to see the full notes.",
        },
        SHARED_STEPS.improvedVersion,
        SHARED_STEPS.discussFeedback,
        {
            id: "transcript-fix",
            title: "Fix misheard words",
            body: "If Sayzo got a name or word wrong, click it in the transcript to set it straight.",
        },
        {
            id: "replay-conversation",
            title: "Practice with a Replay",
            body: "Redo this conversation in your own words, and Sayzo will coach your new take.",
        },
    ],
    replay: [
        {
            id: "fix-these-first",
            title: "Your biggest fixes first",
            body: "The highest-impact changes from this take. Tap a timestamp to hear the exact moment.",
        },
        SHARED_STEPS.improvedVersion,
        SHARED_STEPS.discussFeedback,
        {
            id: "retry-replay",
            title: "Try another take",
            body: "Run this Replay again whenever you like — a second take is the fastest way to lock in a fix.",
        },
    ],
};
