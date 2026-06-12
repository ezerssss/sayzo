import { z } from "zod";

/**
 * Structured, actionable written notes for a captured conversation — the
 * "what do I need to do" companion to the coaching analysis. Stored at
 * `CaptureType.meetingSummary`; generated best-effort by a dedicated
 * small-model pass run alongside deep analysis (see
 * `lib/captures/meeting-summary.ts`), so the field is absent on legacy
 * captures and on captures where generation failed — the UI hides the
 * Summary tab in that case.
 *
 * These are WRITTEN notes, not spoken-suggestion fields: the despeechify
 * floor does not apply to any field here. Every section except `tldr` is
 * optional in spirit — empty arrays / null are first-class output (a casual
 * chat has no action items), and the UI hides empty sections. The server
 * grounds all specifics before storing: deadlines/dates/names/numbers that
 * don't appear in the transcript are nulled or dropped, never rewritten.
 * NEVER regenerated when transcript corrections are added (consistent with
 * analysis: corrections are a display-time overlay and don't re-run LLM
 * passes).
 */
export const meetingSummaryBulletSchema = z.object({
    text: z.string(),
    /** True only for things the group actually decided (renders a "Decision"
     *  badge) — proposals and open discussion stay false. */
    isDecision: z.boolean(),
});
export type MeetingSummaryBullet = z.infer<typeof meetingSummaryBulletSchema>;

export const meetingSummaryActionItemSchema = z.object({
    text: z.string(),
    /**
     * The transcript's own deadline phrasing ("by Friday", "end of the
     * quarter"), never resolved to a calendar date, or null. The server nulls
     * any deadline whose specific tokens aren't grounded in the transcript —
     * better no deadline than an invented one.
     */
    deadline: z.string().nullable(),
});
export type MeetingSummaryActionItem = z.infer<
    typeof meetingSummaryActionItemSchema
>;

export const meetingSummarySchema = z.object({
    /** 1-2 sentences: what the conversation was + the most important outcome.
     *  Always present — a summary with no tldr is rejected wholesale. */
    tldr: z.string(),
    /** 3-6 bullets of what was discussed/decided; may be empty. */
    whatHappened: z.array(meetingSummaryBulletSchema),
    /** Commitments by the learner (the `"user"` transcript speaker) only. */
    yourActionItems: z.array(meetingSummaryActionItemSchema),
    /** Commitments by the other participants. */
    othersActionItems: z.array(meetingSummaryActionItemSchema),
    /** What to expect next / the next meeting, or null. */
    comingUp: z.string().nullable(),
    /** ISO 8601 — when this summary was generated. */
    generatedAt: z.string(),
});
export type MeetingSummary = z.infer<typeof meetingSummarySchema>;
