import { describe, expect, it } from "vitest";

import type { CaptureTranscriptLine } from "@/schemas";
import { inferOneSided } from "./transcribe";

const line = (speaker: string, text = "hi"): CaptureTranscriptLine => ({
    speaker,
    text,
    start: 0,
    end: 1,
});

describe("inferOneSided", () => {
    it("is true when every line is the user (only the mic carried speech)", () => {
        expect(
            inferOneSided([line("user", "okay so first thing"), line("user")]),
        ).toBe(true);
    });

    it("is false when any other-speaker line is present", () => {
        expect(
            inferOneSided([line("user"), line("other_1"), line("user")]),
        ).toBe(false);
        // Even a single short other-speaker line keeps it two-sided.
        expect(inferOneSided([line("user"), line("other_2", "yeah")])).toBe(
            false,
        );
    });

    it("is false for an empty transcript (nothing to coach)", () => {
        expect(inferOneSided([])).toBe(false);
    });
});
