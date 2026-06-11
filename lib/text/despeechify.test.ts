import { describe, expect, it } from "vitest";

import {
    despeechifyDashes,
    despeechifyQuotedSpans,
    despeechifySpokenPunctuation,
    sanitizeSpokenFields,
} from "./despeechify";

describe("despeechifyDashes (shipped behavior, regression-pinned)", () => {
    it("rewrites an em-dash clause seam as a comma", () => {
        expect(despeechifyDashes("Yes — we're on track")).toBe(
            "Yes, we're on track",
        );
    });

    it("rewrites ASCII double-hyphens between words", () => {
        expect(despeechifyDashes("Yes -- we're on track")).toBe(
            "Yes, we're on track",
        );
    });

    it("leaves numeric ranges alone", () => {
        expect(despeechifyDashes("give me 3–5 examples")).toBe(
            "give me 3–5 examples",
        );
    });

    it("never touches regular hyphens", () => {
        expect(despeechifyDashes("a non-native speaker's 60-second drill")).toBe(
            "a non-native speaker's 60-second drill",
        );
    });

    it("drops a sentence-final dash instead of leaving a dangling comma", () => {
        expect(despeechifyDashes("we're on track —")).toBe("we're on track");
    });
});

describe("despeechifySpokenPunctuation", () => {
    it("rewrites semicolon seams as commas", () => {
        expect(despeechifySpokenPunctuation("Yes; we're on track")).toBe(
            "Yes, we're on track",
        );
    });

    it("rewrites defining-colon seams as commas", () => {
        expect(
            despeechifySpokenPunctuation("Here's the thing: we need more time"),
        ).toBe("Here's the thing, we need more time");
    });

    it("leaves times and ratios alone", () => {
        expect(despeechifySpokenPunctuation("let's meet at 3:30")).toBe(
            "let's meet at 3:30",
        );
        expect(despeechifySpokenPunctuation("a 2:1 ratio")).toBe("a 2:1 ratio");
    });

    it("strips bracketed meta-annotations", () => {
        expect(despeechifySpokenPunctuation("we shipped it [claim] on time")).toBe(
            "we shipped it on time",
        );
    });

    it("still handles dashes", () => {
        expect(despeechifySpokenPunctuation("Sayzo — an app; really: the app")).toBe(
            "Sayzo, an app, really, the app",
        );
    });
});

describe("despeechifyQuotedSpans", () => {
    it("preserves the Try: framing colon but cleans inside the quotes", () => {
        expect(
            despeechifyQuotedSpans('Try: "Here\'s the thing: we need more time"'),
        ).toBe('Try: "Here\'s the thing, we need more time"');
    });

    it("preserves framing colons outside quotes in betterOption-style text", () => {
        expect(
            despeechifyQuotedSpans(
                'Lead with the recommendation, then the trade-offs: "I\'d say we wait; there are trade-offs"',
            ),
        ).toBe(
            'Lead with the recommendation, then the trade-offs: "I\'d say we wait, there are trade-offs"',
        );
    });

    it("strips dashes from framing AND quoted speech", () => {
        expect(despeechifyQuotedSpans('One move — try "Sayzo — an app"')).toBe(
            'One move, try "Sayzo, an app"',
        );
    });

    it("handles curly quotes", () => {
        expect(despeechifyQuotedSpans("Try: “Yes; we're on track”")).toBe(
            "Try: “Yes, we're on track”",
        );
    });

    it("leaves single-quoted spans alone (apostrophe ambiguity)", () => {
        const text = "Try: 'thing: a stuff'";
        expect(despeechifyQuotedSpans(text)).toBe(text);
    });
});

describe("sanitizeSpokenFields", () => {
    it("maps each field to the right floor", () => {
        const analysis = {
            fixTheseFirst: [
                {
                    anchor: "verbatim — untouched: yes",
                    betterOption: 'Lead with it: "Yes: we are on track"',
                    whyThisMatters: "prose — untouched: yes",
                },
            ],
            turnRewrites: [{ rewrite: "Pure speech: no colons allowed" }],
            coachingInsight: { body: 'Try: "the fix: simple"' },
            improvedVersion:
                "Spoken line: cleaned\n> **Note:** prose — kept: as-is",
        };

        const out = sanitizeSpokenFields(analysis);
        // anchor / whyThisMatters untouched (verbatim + prose)
        expect(out.fixTheseFirst[0].anchor).toBe("verbatim — untouched: yes");
        expect(out.fixTheseFirst[0].whyThisMatters).toBe(
            "prose — untouched: yes",
        );
        // betterOption: framing colon kept, quoted span cleaned
        expect(out.fixTheseFirst[0].betterOption).toBe(
            'Lead with it: "Yes, we are on track"',
        );
        // turnRewrites: full floor over the whole field
        expect(out.turnRewrites[0].rewrite).toBe(
            "Pure speech, no colons allowed",
        );
        // insight body: Try: framing kept, inside cleaned
        expect(out.coachingInsight!.body).toBe('Try: "the fix, simple"');
        // improvedVersion: spoken line cleaned, Note line untouched
        expect(out.improvedVersion).toBe(
            "Spoken line, cleaned\n> **Note:** prose — kept: as-is",
        );
    });
});
