import { describe, expect, it } from "vitest";

import type { CaptureTranscriptLine } from "@/schemas";
import { __test } from "./analyze";

const {
    buildCoachingInsight,
    resolveInsightQuote,
    expandToCompleteThought,
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

describe("expandToCompleteThought", () => {
    it("grows a clipped fragment out to its enclosing sentence", () => {
        const text =
            "Okay. that leads me to my next point because we should update the codes.";
        const at = text.indexOf("leads me to my next point because");
        expect(
            expandToCompleteThought(
                text,
                at,
                at + "leads me to my next point because".length,
            ),
        ).toBe(
            "that leads me to my next point because we should update the codes.",
        );
    });

    it("does not split on a digit-flanked period", () => {
        const text = "Revenue grew 3.5 percent which is solid.";
        expect(expandToCompleteThought(text, 0, "Revenue grew".length)).toBe(
            "Revenue grew 3.5 percent which is solid.",
        );
    });

    it("does not split on a title abbreviation", () => {
        const text = "Let me talk to Mr. Smith about it before the call.";
        const at = text.indexOf("talk to");
        expect(
            expandToCompleteThought(text, at, at + "talk to".length),
        ).toBe("Let me talk to Mr. Smith about it before the call.");
    });

    it("does not split on an initialism period", () => {
        const text = "We should expand into the U.S. market next year.";
        const at = text.indexOf("expand");
        expect(expandToCompleteThought(text, at, at + "expand".length)).toBe(
            "We should expand into the U.S. market next year.",
        );
    });
});

describe("resolveInsightQuote", () => {
    it("verifies and returns an exact full-line quote", () => {
        const r = resolveInsightQuote(validQuote, transcript);
        expect(r.status).toBe("verified");
        expect(r.quote).toBe(validQuote);
    });

    it("expands a clipped fragment to its complete thought (verbatim)", () => {
        const sentence =
            "that leads me to my next point because we should update the codes to match size.";
        const t = [line("user", `Okay. ${sentence}`)];
        const r = resolveInsightQuote(
            "leads me to my next point because",
            t,
        );
        expect(r.status).toBe("verified");
        expect(r.quote).toBe(sentence);
    });

    it("returns a long multi-sentence turn whole (no length cap)", () => {
        const longTurn =
            "I think the migration is going to be fine, honestly, even though we lost a couple of days to the staging problems. We will absolutely ship it on Friday no matter what happens between now and then.";
        const t = [line("user", longTurn)];
        expect(longTurn.length).toBeGreaterThan(120);
        const r = resolveInsightQuote(longTurn, t);
        expect(r.status).toBe("verified");
        expect(r.quote).toBe(longTurn);
    });

    it("recovers the real line from a near-verbatim model quote", () => {
        const real =
            "we really need to lock the schema before the launch next week";
        const t = [line("user", real)];
        const r = resolveInsightQuote(
            "we need to lock the schema before the launch next week",
            t,
        );
        expect(r.status).toBe("recovered");
        expect(r.quote).toBe(real);
    });

    it("drops a loosely-related quote rather than surface the wrong line", () => {
        const r = resolveInsightQuote(
            "it will probably be okay in the end I believe",
            transcript,
        );
        expect(r.status).toBe("dropped");
        expect(r.quote).toBe(null);
    });

    it("drops quotes from other speakers", () => {
        const r = resolveInsightQuote(
            "Will the migration hit the deadline on Friday?",
            transcript,
        );
        expect(r.quote).toBe(null);
    });
});

describe("extractQuotedSpans", () => {
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
            findFabricatedToken(["Yes. It should land by Friday."], transcript),
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
        const { insight, outcome } = buildCoachingInsight(
            validRaw,
            true,
            transcript,
        );
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(validQuote);
        expect(insight!.type).toBe("rephrase");
        expect(outcome).toBe(null);
    });

    it("returns null when the user has no coachable English", () => {
        const { insight, outcome } = buildCoachingInsight(
            validRaw,
            false,
            transcript,
        );
        expect(insight).toBe(null);
        expect(outcome).toBe("INSIGHT_NULL");
    });

    it("degrades a Try-rewrite to quote-less when the quote can't be grounded (not killed)", () => {
        const raw = {
            ...validRaw,
            quote: "it will probably be okay in the end I believe",
        };
        const { insight, outcome } = buildCoachingInsight(
            raw,
            true,
            transcript,
        );
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(null);
        expect(insight!.body).toBe(validRaw.body);
        expect(outcome).toBe("INSIGHT_QUOTE_DROPPED");
    });

    it("ships a Try-rewrite with no quote attempted (no drop telemetry)", () => {
        const { insight, outcome } = buildCoachingInsight(
            { ...validRaw, quote: null },
            true,
            transcript,
        );
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(null);
        expect(outcome).toBe(null);
    });

    it("recovers a near-verbatim quote and keeps the card", () => {
        const real =
            "we really need to lock the schema before the launch next week";
        const t = [line("user", real)];
        const raw = {
            type: "rephrase",
            headline: "Make it a firm ask",
            quote: "we need to lock the schema before the launch next week",
            body: 'Try: "We have to lock the schema before launch."',
            why: null,
        };
        const { insight, outcome } = buildCoachingInsight(raw, true, t);
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(real);
        expect(outcome).toBe("INSIGHT_QUOTE_RECOVERED");
    });

    it("allows a non-Try body without a quote", () => {
        const raw = {
            type: "structure",
            headline: "Answer first, context after",
            quote: null,
            body: "Lead with the answer you gave at the end, then offer the background.",
            why: null,
        };
        expect(buildCoachingInsight(raw, true, transcript).insight).not.toBe(
            null,
        );
    });

    it("rejects a body whose rewrite invents specifics", () => {
        const raw = {
            ...validRaw,
            body: 'Try: "Yes. The schema fix landed Tuesday and we validated it overnight."',
        };
        const { insight, outcome } = buildCoachingInsight(
            raw,
            true,
            transcript,
        );
        expect(insight).toBe(null);
        expect(outcome).toBe("FABRICATED_INSIGHT_BODY");
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
        const { insight } = buildCoachingInsight(raw, true, t);
        expect(insight).not.toBe(null);
        expect(insight!.quote).toBe(rambling);
    });

    it("still hard-rejects generic-stem insights", () => {
        const raw = {
            ...validRaw,
            headline: "Be more concise",
            body: "Try to be more concise next time you speak.",
        };
        const { insight, outcome } = buildCoachingInsight(
            raw,
            true,
            transcript,
        );
        expect(insight).toBe(null);
        expect(outcome).toBe("GENERIC_INSIGHT");
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
