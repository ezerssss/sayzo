import { describe, expect, it } from "vitest";

import {
    computeTokenCostUsd,
    deepgramCostUsd,
    ttsCostUsd,
} from "@/constants/llm-pricing";
import { classifyError } from "@/lib/llm/error-class";
import { promptVersionHash } from "@/lib/llm/prompt-version";
import { aggregateLlmEvents } from "@/lib/admin/metrics-events";
import { llmErrorClassSchema } from "@/schemas";
import type { LlmErrorClass, LlmEvent } from "@/schemas";

describe("promptVersionHash", () => {
    it("is stable for the same resolved parts", () => {
        const a = promptVersionHash({
            system: "rules",
            postTranscriptRecap: "recap",
        });
        const b = promptVersionHash({
            system: "rules",
            postTranscriptRecap: "recap",
        });
        expect(a).toBe(b);
        expect(a).toHaveLength(16);
    });

    it("changes when the system OR the recap changes (catches shared-include edits)", () => {
        const base = promptVersionHash({
            system: "rules",
            postTranscriptRecap: "recap",
        });
        expect(
            promptVersionHash({
                system: "rules v2",
                postTranscriptRecap: "recap",
            }),
        ).not.toBe(base);
        expect(
            promptVersionHash({
                system: "rules",
                postTranscriptRecap: "recap v2",
            }),
        ).not.toBe(base);
    });

    it("returns empty string for no prompt (ASR/TTS)", () => {
        expect(promptVersionHash()).toBe("");
        expect(promptVersionHash({ system: "" })).toBe("");
    });
});

describe("classifyError", () => {
    it("always returns a bounded enum, never the raw message", () => {
        const cases: unknown[] = [
            new Error("the user said something private and it timed out"),
            { status: 429, message: "rate limit" },
            { status: 503 },
            { status: 400 },
            new Error("Zod validation failed: transcript content here"),
            "ECONNRESET while talking to provider",
            null,
        ];
        for (const c of cases) {
            const cls = classifyError(c);
            // The result is one of the enum values — no message text leaks.
            expect(llmErrorClassSchema.safeParse(cls).success).toBe(true);
        }
    });

    it("maps known signatures to the right class", () => {
        expect(classifyError({ status: 429 })).toBe<LlmErrorClass>(
            "rate_limit",
        );
        expect(classifyError({ status: 502 })).toBe<LlmErrorClass>(
            "provider_5xx",
        );
        expect(classifyError({ status: 404 })).toBe<LlmErrorClass>(
            "provider_4xx",
        );
        expect(
            classifyError(new Error("request timed out")),
        ).toBe<LlmErrorClass>("timeout");
        expect(
            classifyError(new Error("no object generated: schema parse error")),
        ).toBe<LlmErrorClass>("schema_parse");
        expect(classifyError(new Error("totally weird"))).toBe<LlmErrorClass>(
            "unknown",
        );
    });
});

describe("pricing", () => {
    it("prices a known model and returns null for unknown / token-less", () => {
        // gpt-4o-mini: $0.15/1M in, $0.60/1M out
        expect(
            computeTokenCostUsd("gpt-4o-mini", 1_000_000, 1_000_000),
        ).toBeCloseTo(0.75, 6);
        expect(
            computeTokenCostUsd("some-unknown-model", 1000, 1000),
        ).toBeNull();
        expect(computeTokenCostUsd("gpt-4o-mini", null, null)).toBeNull();
    });

    it("prices a dated model id via prefix fallback", () => {
        expect(
            computeTokenCostUsd("gpt-4o-mini-2024-07-18", 1_000_000, 0),
        ).toBeCloseTo(0.15, 6);
    });

    it("computes ASR and TTS cost", () => {
        expect(deepgramCostUsd(60)).toBeCloseTo(0.0043, 6);
        expect(ttsCostUsd(1_000_000)).toBeCloseTo(0.6, 6);
    });
});

function evt(p: Partial<LlmEvent>): LlmEvent {
    return {
        promptKey: "capture.deep_analysis",
        promptVersionHash: "hash1",
        model: "gpt-5-mini",
        provider: "openai",
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.001,
        latencyMs: 1000,
        success: true,
        errorClass: null,
        qualityOutcomes: [],
        refs: { uid: null, captureId: null, sessionId: null },
        createdAt: "2026-06-01T00:00:00.000Z",
        ...p,
    };
}

describe("aggregateLlmEvents", () => {
    it("groups by prompt version and tallies cost, failures, outcomes", () => {
        const events: LlmEvent[] = [
            evt({ promptVersionHash: "v1", costUsd: 0.002, latencyMs: 500 }),
            evt({
                promptVersionHash: "v1",
                costUsd: 0.004,
                latencyMs: 1500,
                qualityOutcomes: ["GENERIC_INSIGHT"],
            }),
            evt({
                promptVersionHash: "v2",
                costUsd: 0.001,
                latencyMs: 800,
                success: false,
                errorClass: "rate_limit",
            }),
        ];

        const agg = aggregateLlmEvents(events);
        expect(agg.totalCalls).toBe(3);
        expect(agg.totalFailures).toBe(1);
        expect(agg.totalCostUsd).toBeCloseTo(0.007, 6);
        expect(agg.totalInputTokens).toBe(300);

        const v1 = agg.versions.find((v) => v.promptVersionHash === "v1");
        const v2 = agg.versions.find((v) => v.promptVersionHash === "v2");
        expect(v1?.calls).toBe(2);
        expect(v1?.qualityOutcomeCounts.GENERIC_INSIGHT).toBe(1);
        expect(v2?.failures).toBe(1);
        expect(v2?.errorClassCounts.rate_limit).toBe(1);

        // The deep_analysis prompt key rolls both versions up.
        const key = agg.byPromptKey.find(
            (k) => k.promptKey === "capture.deep_analysis",
        );
        expect(key?.calls).toBe(3);
    });
});
