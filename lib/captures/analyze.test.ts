import { describe, expect, it } from "vitest";

import type { CaptureTranscriptLine } from "@/schemas";
import { __test } from "./analyze";

const {
    buildCoachingInsight,
    verifyInsightQuote,
    isTryRewriteBody,
    extractQuotedSpans,
    findFabricatedToken,
} = __test;

const line = (
    speaker: string,
    text: string,
    start = 0,
    end = 1,
): CaptureTranscriptLine => ({ speaker, text, start, end });

const transcript: CaptureTranscriptLine[] = [
    line("other_1", "Will the migration hit the deadline on Friday?"),
    line(
        "user",
        "I think maybe like, you know, it should probably be fine, I think.",
    ),
    line("user", "We could push it back a week if we have to."),
];

const validQuote =
    "I think maybe like, you know, it should probably be fine, I think.";

describe("verifyInsightQuote", () => {
    it("returns the verbatim user text for an exact quote", () => {
        expect(verifyInsightQuote(validQuote, transcript)).toBe(validQuote);
    });

    it("returns a long multi-sentence quote whole (no length cap)", () => {
        const longTurn =
            "I think the migration is going to be fine, honestly, even though we lost a couple of days to the staging problems. We will absolutely ship it on Friday no matter what happens between now and then.";
        const t = [line("user", longTurn)];
        expect(longTurn.length).toBeGreaterThan(120);
        expect(verifyInsightQuote(longTurn, t)).toBe(longTurn);
    });

    it("rejects paraphrases (fuzzy resolution)", () => {
        expect(
            verifyInsightQuote(
                "it will probably be okay in the end I believe",
                transcript,
            ),
        ).toBe(null);
    });

    it("rejects quotes from other speakers", () => {
        expect(
            verifyInsightQuote(
                "Will the migration hit the deadline on Friday?",
                transcript,
            ),
        ).toBe(null);
    });
});

describe("isTryRewriteBody / extractQuotedSpans", () => {
    it("detects Try-style bodies", () => {
        expect(isTryRewriteBody('Try: "Yes, it should be fine."')).toBe(true);
        expect(isTryRewriteBody("Next time, try “Yes, it works.”")).toBe(true);
        expect(isTryRewriteBody("Lead with the recommendation first.")).toBe(
            false,
        );
    });

    it("extracts straight and curly double-quoted spans", () => {
        expect(
            extractQuotedSpans('Try: "first span" and “second span”'),
        ).toEqual(["first span", "second span"]);
    });
});

describe("findFabricatedToken", () => {
    it("accepts rewrites grounded in the transcript", () => {
        expect(
            findFabricatedToken(["Yes, it should be fine."], transcript),
        ).toBe(null);
    });

    it("flags invented proper nouns (weekdays included)", () => {
        expect(
            findFabricatedToken(
                ["We validated it on Tuesday with the platform team."],
                transcript,
            ),
        ).toBe("Tuesday");
    });

    it("flags invented numbers", () => {
        expect(
            findFabricatedToken(["We can ship all 15 of them."], transcript),
        ).toBe("15");
    });

    it("accepts proper nouns said by other speakers (conservative scope)", () => {
        expect(
            findFabricatedToken(
                ["Yes. It should land by Friday."],
                transcript,
            ),
        ).toBe(null);
    });

    it("accepts digits whose spelled-out form was said", () => {
        const t = [line("user", "give me three reasons to wait")];
        expect(findFabricatedToken(["Give me 3 reasons."], t)).toBe(null);
    });

    it("skips sentence-initial capitalized words", () => {
        expect(
            findFabricatedToken(["Push it back. Keep the scope."], transcript),
        ).toBe(null);
    });
});

describe("buildCoachingInsight", () => {
    const validRaw = {
        type: "rephrase",
        headline: "Commit to your answer",
        quote: validQuote,
        body: 'Try: "Yes, it should be fine."',
        why: null,
    };

    it("builds a valid insight with a verified verbatim quote", () => {
        const insight = buildCoachingInsight(validRaw, true, transcript);
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(validQuote);
        expect(insight!.type).toBe("rephrase");
    });

    it("returns null when the user has no coachable English", () => {
        expect(buildCoachingInsight(validRaw, false, transcript)).toBe(null);
    });

    it("rejects a Try-rewrite body whose quote fails verification", () => {
        const raw = {
            ...validRaw,
            quote: "it will probably be okay in the end I believe",
        };
        expect(buildCoachingInsight(raw, true, transcript)).toBe(null);
    });

    it("rejects a Try-rewrite body with no quote at all", () => {
        expect(
            buildCoachingInsight(
                { ...validRaw, quote: null },
                true,
                transcript,
            ),
        ).toBe(null);
    });

    it("allows a non-Try body without a quote", () => {
        const raw = {
            type: "structure",
            headline: "Answer first, context after",
            quote: null,
            body: "Lead with the answer you gave at the end, then offer the background.",
            why: null,
        };
        expect(buildCoachingInsight(raw, true, transcript)).not.toBe(null);
    });

    it("rejects a body whose rewrite invents specifics", () => {
        const raw = {
            ...validRaw,
            body: 'Try: "Yes. The schema fix landed Tuesday and we validated it overnight."',
        };
        expect(buildCoachingInsight(raw, true, transcript)).toBe(null);
    });

    it("keeps a long boundary-less quote whole under a Try body (no cap)", () => {
        const rambling =
            "so basically what happened was we kind of went back and forth on the whole thing for a while and nobody really landed anywhere at all";
        const t = [line("user", rambling)];
        const raw = {
            type: "rephrase",
            headline: "Land the point",
            quote: rambling,
            body: 'Try: "We went back and forth and nobody landed anywhere."',
            why: null,
        };
        const insight = buildCoachingInsight(raw, true, t);
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(rambling);
    });

    it("still hard-rejects generic-stem insights", () => {
        const raw = {
            ...validRaw,
            headline: "Be more concise",
            body: "Try to be more concise next time you speak.",
        };
        expect(buildCoachingInsight(raw, true, transcript)).toBe(null);
    });
});

describe("enforceNonEnglishPassthrough", () => {
    const { enforceNonEnglishPassthrough } = __test;

    it("forces rewrite=original, note=null, suggestedBeforeIdx=null on non_english", () => {
        const enforced = enforceNonEnglishPassthrough({
            transcriptIdx: 1,
            original: "sige sige tapos na ang migration diba",
            rewrite: "Yes, the migration is already done.",
            verdict: "non_english",
            note: "Translated and cleaned up.",
            suggestedBeforeIdx: 0,
        });
        expect(enforced.rewrite).toBe("sige sige tapos na ang migration diba");
        expect(enforced.note).toBe(null);
        expect(enforced.suggestedBeforeIdx).toBe(null);
    });

    it("leaves other verdicts untouched", () => {
        const entry = {
            transcriptIdx: 2,
            original: "I think maybe it should be fine.",
            rewrite: "Yes, it should be fine.",
            verdict: "tighten" as const,
            note: "Drop the stacked hedges.",
            suggestedBeforeIdx: null,
        };
        expect(enforceNonEnglishPassthrough(entry)).toEqual(entry);
    });
});
