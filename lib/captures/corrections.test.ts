import { describe, expect, it } from "vitest";

import type { CaptureTranscriptLine, TranscriptCorrection } from "@/schemas";

import {
    applyCorrectionsToLine,
    applyCorrectionsToText,
    applyTranscriptCorrections,
    checkCorrectionGuards,
    mergeVocabulary,
    segmentLineWithCorrections,
    tokenizeLine,
    type CorrectionCandidate,
} from "./corrections";

const line = (speaker: string, text: string): CaptureTranscriptLine => ({
    speaker,
    text,
    start: 0,
    end: 1,
});

const correction = (
    overrides: Partial<TranscriptCorrection>,
): TranscriptCorrection => ({
    transcriptIdx: 0,
    charStart: 0,
    charEnd: 1,
    original: "x",
    replacement: "y",
    isVocabularyTerm: false,
    createdAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
});

describe("tokenizeLine", () => {
    it("returns tokens with correct char offsets", () => {
        const tokens = tokenizeLine("Um, the case on project");
        expect(tokens.map((t) => t.text)).toEqual([
            "Um,",
            "the",
            "case",
            "on",
            "project",
        ]);
        expect(tokens[2]).toEqual({ text: "case", start: 8, end: 12 });
    });

    it("handles multiple spaces between words", () => {
        const tokens = tokenizeLine("a  b");
        expect(tokens).toEqual([
            { text: "a", start: 0, end: 1 },
            { text: "b", start: 3, end: 4 },
        ]);
    });
});

describe("checkCorrectionGuards", () => {
    // "the case on update is ready" — "case on" is the misheard "Quezon".
    const transcript = [line("user", "um, the case on update is ready")];

    const candidate = (
        overrides: Partial<CorrectionCandidate>,
    ): CorrectionCandidate => ({
        transcriptIdx: 0,
        charStart: 8, // "case on"
        charEnd: 15,
        original: "case on",
        replacement: "Quezon",
        ...overrides,
    });

    it("passes a clean mishearing candidate", () => {
        expect(checkCorrectionGuards(candidate({}), transcript, [])).toBe(
            null,
        );
    });

    it("rejects spans covering more than 4 words", () => {
        const t = [line("user", "one two three four five six")];
        const result = checkCorrectionGuards(
            candidate({
                charStart: 0,
                charEnd: 23, // "one two three four five"
                original: "one two three four five",
            }),
            t,
            [],
        );
        expect(result?.code).toBe("span_too_long");
    });

    it("rejects non-token-aligned offsets", () => {
        const result = checkCorrectionGuards(
            candidate({ charStart: 9, charEnd: 15, original: "ase on" }),
            transcript,
            [],
        );
        expect(result?.code).toBe("span_not_token_aligned");
    });

    it("rejects when original does not match the slice", () => {
        const result = checkCorrectionGuards(
            candidate({ original: "case in" }),
            transcript,
            [],
        );
        expect(result?.code).toBe("original_mismatch");
    });

    it("rejects locked fillers, including capitalized/punctuated variants", () => {
        const result = checkCorrectionGuards(
            candidate({ charStart: 0, charEnd: 3, original: "um," }),
            transcript,
            [],
        );
        expect(result?.code).toBe("locked_filler_in_span");
    });

    it("rejects locked bigrams inside a larger span", () => {
        const t = [line("user", "so you know the plan works")];
        const result = checkCorrectionGuards(
            candidate({
                charStart: 3,
                charEnd: 20, // "you know the plan"
                original: "you know the plan",
            }),
            t,
            [],
        );
        expect(result?.code).toBe("locked_filler_in_span");
    });

    it("allows ambiguous discourse words (judge territory, not hard-locked)", () => {
        const t = [line("user", "and like said the report is due")];
        const result = checkCorrectionGuards(
            candidate({
                charStart: 4,
                charEnd: 8,
                original: "like",
                replacement: "Mike",
            }),
            t,
            [],
        );
        expect(result).toBe(null);
    });

    it("rejects whitespace-only replacements", () => {
        const result = checkCorrectionGuards(
            candidate({ replacement: "   " }),
            transcript,
            [],
        );
        expect(result?.code).toBe("empty_replacement");
    });

    it("rejects overlong replacements", () => {
        const result = checkCorrectionGuards(
            candidate({ replacement: "a b c d e f g h" }),
            transcript,
            [],
        );
        expect(result?.code).toBe("replacement_too_long");
    });

    it("rejects overlap with an existing correction (incl. identical resubmit)", () => {
        const existing = [
            correction({
                transcriptIdx: 0,
                charStart: 8,
                charEnd: 15,
                original: "case on",
                replacement: "Quezon",
            }),
        ];
        const result = checkCorrectionGuards(
            candidate({}),
            transcript,
            existing,
        );
        expect(result?.code).toBe("overlaps_existing");
    });

    it("rejects overlap within the same batch", () => {
        const result = checkCorrectionGuards(
            candidate({}),
            transcript,
            [],
            [candidate({})],
        );
        expect(result?.code).toBe("overlaps_in_batch");
    });

    it("does not flag same-offset spans on different lines as overlapping", () => {
        const t = [
            line("user", "um, the case on update is ready"),
            line("user", "um, the case on update is ready"),
        ];
        const result = checkCorrectionGuards(
            candidate({ transcriptIdx: 1 }),
            t,
            [
                correction({
                    transcriptIdx: 0,
                    charStart: 8,
                    charEnd: 15,
                    original: "case on",
                }),
            ],
        );
        expect(result).toBe(null);
    });

    it("enforces the per-capture cap", () => {
        const existing = Array.from({ length: 10 }, (_, i) =>
            correction({ transcriptIdx: i }),
        );
        const result = checkCorrectionGuards(
            candidate({}),
            transcript,
            existing,
        );
        expect(result?.code).toBe("capture_cap_reached");
    });
});

describe("applyCorrectionsToLine", () => {
    const text = "the case on report for say so is due";

    it("applies multiple corrections right-to-left so offsets survive", () => {
        const corrected = applyCorrectionsToLine(text, [
            correction({
                charStart: 4,
                charEnd: 11,
                original: "case on",
                replacement: "Quezon",
            }),
            correction({
                charStart: 23,
                charEnd: 29,
                original: "say so",
                replacement: "Sayzo",
            }),
        ]);
        expect(corrected).toBe("the Quezon report for Sayzo is due");
    });

    it("skips corrections whose original no longer matches (integrity)", () => {
        const corrected = applyCorrectionsToLine(text, [
            correction({
                charStart: 4,
                charEnd: 11,
                original: "WRONG",
                replacement: "Quezon",
            }),
        ]);
        expect(corrected).toBe(text);
    });
});

describe("applyTranscriptCorrections", () => {
    it("routes corrections by index and leaves the input untouched", () => {
        const transcript = [
            line("user", "say so is great"),
            line("other_1", "what is say so"),
        ];
        const result = applyTranscriptCorrections(transcript, [
            correction({
                transcriptIdx: 1,
                charStart: 8,
                charEnd: 14,
                original: "say so",
                replacement: "Sayzo",
            }),
        ]);
        expect(result[0].text).toBe("say so is great");
        expect(result[1].text).toBe("what is Sayzo");
        expect(transcript[1].text).toBe("what is say so");
    });
});

describe("applyCorrectionsToText", () => {
    it("replaces the corrected phrase inside an analysis quote", () => {
        const result = applyCorrectionsToText(
            "you said the case on update is ready",
            [correction({ original: "case on", replacement: "Quezon" })],
        );
        expect(result).toBe("you said the Quezon update is ready");
    });

    it("is a no-op with no corrections", () => {
        expect(applyCorrectionsToText("hello", [])).toBe("hello");
    });
});

describe("segmentLineWithCorrections", () => {
    it("splits into raw and corrected segments covering the whole line", () => {
        const text = "the case on report";
        const segments = segmentLineWithCorrections(text, [
            correction({
                charStart: 4,
                charEnd: 11,
                original: "case on",
                replacement: "Quezon",
            }),
        ]);
        expect(segments).toEqual([
            { kind: "raw", text: "the ", start: 0, end: 4 },
            {
                kind: "corrected",
                text: "Quezon",
                original: "case on",
                start: 4,
                end: 11,
            },
            { kind: "raw", text: " report", start: 11, end: 18 },
        ]);
    });

    it("ignores integrity-failing corrections (line stays raw)", () => {
        const segments = segmentLineWithCorrections("abc", [
            correction({ charStart: 0, charEnd: 3, original: "xyz" }),
        ]);
        expect(segments).toEqual([
            { kind: "raw", text: "abc", start: 0, end: 3 },
        ]);
    });
});

describe("mergeVocabulary", () => {
    it("dedupes case-insensitively, keeping the newest casing", () => {
        expect(mergeVocabulary(["quezon"], ["Quezon", "Sayzo"])).toEqual([
            "Quezon",
            "Sayzo",
        ]);
    });

    it("caps at 50 by evicting the oldest", () => {
        const existing = Array.from({ length: 50 }, (_, i) => `term${i}`);
        const merged = mergeVocabulary(existing, ["newest"]);
        expect(merged).toHaveLength(50);
        expect(merged[0]).toBe("term1");
        expect(merged[merged.length - 1]).toBe("newest");
    });

    it("ignores blank additions", () => {
        expect(mergeVocabulary(["a"], ["  ", ""])).toEqual(["a"]);
    });
});
