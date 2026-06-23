import { describe, expect, it } from "vitest";

import { decideAccepted } from "./validate";

const flags = (over: Partial<Parameters<typeof decideAccepted>[0]> = {}) => ({
    isRelevant: true,
    isOrganic: true,
    hasSubstance: true,
    hasCoachableEnglish: true,
    isOneSided: false,
    ...over,
});

describe("decideAccepted — two-sided (all four gates)", () => {
    it("accepts only when all four pass", () => {
        expect(decideAccepted(flags())).toBe(true);
    });

    it("rejects when any gate fails", () => {
        expect(decideAccepted(flags({ isRelevant: false }))).toBe(false);
        expect(decideAccepted(flags({ isOrganic: false }))).toBe(false);
        expect(decideAccepted(flags({ hasSubstance: false }))).toBe(false);
        expect(decideAccepted(flags({ hasCoachableEnglish: false }))).toBe(
            false,
        );
    });
});

describe("decideAccepted — one-sided (only the organic gate is dropped)", () => {
    it("accepts a rehearsed/solo monologue: organic false, but relevant true", () => {
        expect(
            decideAccepted(flags({ isOneSided: true, isOrganic: false })),
        ).toBe(true);
    });

    it("still rejects media (isRelevant false) — a podcast picked up by the mic", () => {
        // isRelevant is KEPT for one-sided, redefined as "the user is genuinely
        // speaking, not media they're merely playing".
        expect(
            decideAccepted(flags({ isOneSided: true, isRelevant: false })),
        ).toBe(false);
    });

    it("still rejects a one-sided capture with no coachable English", () => {
        expect(
            decideAccepted(
                flags({ isOneSided: true, hasCoachableEnglish: false }),
            ),
        ).toBe(false);
    });

    it("still rejects a near-silent one-sided capture (no substance)", () => {
        expect(
            decideAccepted(flags({ isOneSided: true, hasSubstance: false })),
        ).toBe(false);
    });
});
