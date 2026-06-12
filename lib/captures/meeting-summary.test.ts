import { describe, expect, it } from "vitest";

import type { CaptureTranscriptLine } from "@/schemas";
import { __test } from "./meeting-summary";

const { buildMeetingSummary, verifyDeadline } = __test;

const line = (
    speaker: string,
    text: string,
    start = 0,
    end = 1,
): CaptureTranscriptLine => ({ speaker, text, start, end });

const transcript: CaptureTranscriptLine[] = [
    line("other_1", "Okay, so where are we on the migration?"),
    line(
        "user",
        "It's blocked on the auth service upgrade, I don't think we make this sprint.",
    ),
    line(
        "other_1",
        "Fine, let's move it to next sprint and ship behind a feature flag.",
    ),
    line("user", "Agreed. I can draft the rollback plan, I'll have it by Friday at 3 PM."),
    line("other_1", "Good, I'll take the auth upgrade. Let's sync Thursday."),
];

// A minimal grounded LLM output that buildMeetingSummary accepts unchanged.
const groundedRaw = {
    tldr: "Migration sync: the migration moved to next sprint, and you own the rollback plan.",
    whatHappened: [
        {
            text: "The migration is blocked on the auth service upgrade.",
            isDecision: false,
        },
        {
            text: "It moves to next sprint and ships behind a feature flag.",
            isDecision: true,
        },
    ],
    yourActionItems: [{ text: "Draft the rollback plan", deadline: "by Friday" }],
    othersActionItems: [
        { text: "Your teammate will land the auth upgrade", deadline: null },
    ],
    comingUp: "You sync again Thursday.",
};

describe("verifyDeadline", () => {
    it("keeps a deadline whose weekday was said", () => {
        expect(verifyDeadline("by Friday", transcript)).toBe("by Friday");
    });

    it("nulls a deadline with an invented weekday, even sentence-initial", () => {
        expect(verifyDeadline("Tuesday", transcript)).toBe(null);
        expect(verifyDeadline("by Tuesday morning", transcript)).toBe(null);
    });

    it("ignores digit formatting differences (3 PM vs 3pm)", () => {
        expect(verifyDeadline("Friday at 3pm", transcript)).toBe(
            "Friday at 3pm",
        );
    });

    it("nulls an invented digit", () => {
        expect(verifyDeadline("by 5pm", transcript)).toBe(null);
    });

    it("grounds a digit through its spelled form", () => {
        const t = [line("user", "give me three days on this")];
        expect(verifyDeadline("in 3 days", t)).toBe("in 3 days");
    });

    it("passes non-specific phrasing untouched", () => {
        expect(verifyDeadline("soon", transcript)).toBe("soon");
        expect(verifyDeadline("next sprint", transcript)).toBe("next sprint");
    });

    it("nulls empty and null input", () => {
        expect(verifyDeadline(null, transcript)).toBe(null);
        expect(verifyDeadline("   ", transcript)).toBe(null);
    });
});

describe("buildMeetingSummary", () => {
    it("passes a fully grounded summary through, trimmed and stamped", () => {
        const built = buildMeetingSummary(groundedRaw, transcript);
        expect(built).not.toBeNull();
        expect(built!.tldr).toBe(groundedRaw.tldr);
        expect(built!.whatHappened).toHaveLength(2);
        expect(built!.whatHappened[1].isDecision).toBe(true);
        expect(built!.yourActionItems).toEqual([
            { text: "Draft the rollback plan", deadline: "by Friday" },
        ]);
        expect(built!.comingUp).toBe("You sync again Thursday.");
        expect(Date.parse(built!.generatedAt)).not.toBeNaN();
    });

    it("rejects the whole summary when the tldr invents a specific", () => {
        const raw = {
            ...groundedRaw,
            tldr: "Planning call with Vanessa about the migration.",
        };
        expect(buildMeetingSummary(raw, transcript)).toBe(null);
    });

    it("rejects an empty tldr", () => {
        expect(
            buildMeetingSummary({ ...groundedRaw, tldr: "   " }, transcript),
        ).toBe(null);
    });

    it("drops only the fabricating bullet, keeping its siblings", () => {
        const raw = {
            ...groundedRaw,
            whatHappened: [
                ...groundedRaw.whatHappened,
                { text: "Budget review moved to the Atlanta office.", isDecision: false },
            ],
        };
        const built = buildMeetingSummary(raw, transcript);
        expect(built!.whatHappened).toHaveLength(2);
    });

    it("keeps a name that was actually spoken", () => {
        const t = [
            ...transcript,
            line("other_1", "I'll loop in Vanessa on the rollback plan."),
        ];
        const raw = {
            ...groundedRaw,
            whatHappened: [
                { text: "Someone will loop in Vanessa.", isDecision: false },
            ],
        };
        const built = buildMeetingSummary(raw, t);
        expect(built!.whatHappened).toHaveLength(1);
    });

    it("nulls an ungrounded deadline but keeps the action item", () => {
        const raw = {
            ...groundedRaw,
            yourActionItems: [
                { text: "Draft the rollback plan", deadline: "by Tuesday" },
            ],
        };
        const built = buildMeetingSummary(raw, transcript);
        expect(built!.yourActionItems).toEqual([
            { text: "Draft the rollback plan", deadline: null },
        ]);
    });

    it("drops an action item whose text invents a specific", () => {
        const raw = {
            ...groundedRaw,
            othersActionItems: [
                { text: "Hand the rollout to the Falcon team", deadline: null },
            ],
        };
        const built = buildMeetingSummary(raw, transcript);
        expect(built!.othersActionItems).toEqual([]);
    });

    it("nulls a fabricating comingUp without losing the rest", () => {
        const raw = {
            ...groundedRaw,
            comingUp: "Demo scheduled with the Berlin office.",
        };
        const built = buildMeetingSummary(raw, transcript);
        expect(built).not.toBeNull();
        expect(built!.comingUp).toBe(null);
    });

    it("treats empty strings as absent sections", () => {
        const raw = {
            ...groundedRaw,
            whatHappened: [{ text: "  ", isDecision: false }],
            yourActionItems: [{ text: "", deadline: "by Friday" }],
            comingUp: "  ",
        };
        const built = buildMeetingSummary(raw, transcript);
        expect(built!.whatHappened).toEqual([]);
        expect(built!.yourActionItems).toEqual([]);
        expect(built!.comingUp).toBe(null);
    });

    it("returns null for null input", () => {
        expect(buildMeetingSummary(null, transcript)).toBe(null);
    });
});
