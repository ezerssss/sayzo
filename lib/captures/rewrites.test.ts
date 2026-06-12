import { describe, expect, it } from "vitest";

import type { TurnRewrite } from "@/schemas";

import { stitchTurnRewrites } from "./rewrites";

const entry = (overrides: Partial<TurnRewrite>): TurnRewrite => ({
    transcriptIdx: 0,
    original: "original text",
    rewrite: "rewrite text",
    verdict: "tighten",
    note: null,
    suggestedBeforeIdx: null,
    ...overrides,
});

describe("stitchTurnRewrites", () => {
    it("uses original for keep, rewrite otherwise, one paragraph per turn", () => {
        const stitched = stitchTurnRewrites([
            entry({ verdict: "keep", original: "Sounds good." }),
            entry({ verdict: "tighten", rewrite: "Let's move on." }),
        ]);
        expect(stitched).toBe("Sounds good.\n\nLet's move on.");
    });

    it("skips non_english turns entirely", () => {
        const stitched = stitchTurnRewrites([
            entry({ verdict: "keep", original: "Sounds good." }),
            entry({
                verdict: "non_english",
                original: "sige sige tapos na yan",
                rewrite: "sige sige tapos na yan",
            }),
            entry({ verdict: "sharpen", rewrite: "That's the core issue." }),
        ]);
        expect(stitched).toBe("Sounds good.\n\nThat's the core issue.");
    });

    it("drops empty entries", () => {
        const stitched = stitchTurnRewrites([
            entry({ verdict: "keep", original: "   " }),
            entry({ verdict: "tighten", rewrite: "Let's move on." }),
        ]);
        expect(stitched).toBe("Let's move on.");
    });
});
