import { describe, expect, it } from "vitest";

import { reactionDocId, reactionSubmissionSchema } from "@/schemas";
import { aggregateReactions } from "@/lib/admin/metrics-l1";
import type { ItemReaction } from "@/schemas";

describe("reactionSubmissionSchema", () => {
    it("defaults target/reasonCode/reason for a minimal payload", () => {
        const parsed = reactionSubmissionSchema.parse({
            source: "capture",
            itemId: "cap1",
            rating: "up",
        });
        expect(parsed.target).toBe("overall");
        expect(parsed.reasonCode).toBeNull();
        expect(parsed.reason).toBeNull();
    });

    it("trims the reason and rejects invalid rating", () => {
        const parsed = reactionSubmissionSchema.parse({
            source: "session",
            itemId: "s1",
            rating: "down",
            reasonCode: "too_harsh",
            reason: "  too blunt  ",
        });
        expect(parsed.reason).toBe("too blunt");

        expect(
            reactionSubmissionSchema.safeParse({
                source: "capture",
                itemId: "x",
                rating: "meh",
            }).success,
        ).toBe(false);
    });

    it("rejects a reason longer than 280 chars", () => {
        const res = reactionSubmissionSchema.safeParse({
            source: "capture",
            itemId: "x",
            rating: "down",
            reason: "a".repeat(281),
        });
        expect(res.success).toBe(false);
    });
});

describe("reactionDocId", () => {
    it("is stable and unique per (item, target, user)", () => {
        expect(reactionDocId("capture", "cap1", "u1", "overall")).toBe(
            "capture__cap1__u1__overall",
        );
        expect(reactionDocId("session", "s1", "u1", "coaching_insight")).toBe(
            "session__s1__u1__coaching_insight",
        );
    });
});

describe("aggregateReactions", () => {
    it("counts up/down and reason codes", () => {
        const rows: ItemReaction[] = [
            {
                uid: "u1",
                source: "capture",
                itemId: "c1",
                target: "overall",
                rating: "up",
                reasonCode: "helpful",
                reason: null,
                createdAt: "2026-06-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
            },
            {
                uid: "u2",
                source: "capture",
                itemId: "c2",
                target: "overall",
                rating: "down",
                reasonCode: "too_harsh",
                reason: "ouch",
                createdAt: "2026-06-02T00:00:00.000Z",
                updatedAt: "2026-06-02T00:00:00.000Z",
            },
            {
                uid: "u3",
                source: "session",
                itemId: "s1",
                target: "overall",
                rating: "down",
                reasonCode: "too_harsh",
                reason: null,
                createdAt: "2026-06-03T00:00:00.000Z",
                updatedAt: "2026-06-03T00:00:00.000Z",
            },
        ];
        const agg = aggregateReactions(rows);
        expect(agg.total).toBe(3);
        expect(agg.up).toBe(1);
        expect(agg.down).toBe(2);
        expect(agg.reasonCodeCounts.too_harsh).toBe(2);
        expect(agg.reasonCodeCounts.helpful).toBe(1);
    });
});
