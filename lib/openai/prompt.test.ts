import { describe, expect, it } from "vitest";

import { loadModelPrompt, loadModelPromptParts } from "./prompt";

const REASONING = "gpt-5-mini";
const CHAT = "gpt-4o-mini";

const RAW = `Rule prose stays.
<!-- examples:start -->
Example body.
<!-- examples:end -->
More rules.
<!-- chat:start -->
Chat-only scaffolding.
<!-- chat:end -->
<!-- recap:start -->
Recap line one.
Recap line two.
<!-- recap:end -->
Final rules.`;

describe("loadModelPromptParts", () => {
    it("strips examples and chat blocks for reasoning models", () => {
        const { system } = loadModelPromptParts(RAW, REASONING);
        expect(system).toContain("Rule prose stays.");
        expect(system).toContain("More rules.");
        expect(system).toContain("Final rules.");
        expect(system).not.toContain("Example body.");
        expect(system).not.toContain("Chat-only scaffolding.");
    });

    it("keeps examples and chat blocks for chat models", () => {
        const { system } = loadModelPromptParts(RAW, CHAT);
        expect(system).toContain("Example body.");
        expect(system).toContain("Chat-only scaffolding.");
    });

    it("never leaks marker lines", () => {
        for (const model of [REASONING, CHAT]) {
            const { system, postTranscriptRecap } = loadModelPromptParts(
                RAW,
                model,
            );
            expect(system).not.toContain("<!--");
            expect(postTranscriptRecap ?? "").not.toContain("<!--");
        }
    });

    it("removes the recap from the system prompt for both classes", () => {
        expect(loadModelPromptParts(RAW, REASONING).system).not.toContain(
            "Recap line",
        );
        expect(loadModelPromptParts(RAW, CHAT).system).not.toContain(
            "Recap line",
        );
    });

    it("returns the recap only for chat models", () => {
        expect(loadModelPromptParts(RAW, REASONING).postTranscriptRecap).toBe(
            null,
        );
        expect(loadModelPromptParts(RAW, CHAT).postTranscriptRecap).toBe(
            "Recap line one.\nRecap line two.",
        );
    });

    it("expands includes against prompts/ for both classes", () => {
        const raw = "Intro.\n<!-- include: shared/spoken-rewrite-spec.md -->\nOutro.";
        for (const model of [REASONING, CHAT]) {
            const { system } = loadModelPromptParts(raw, model);
            expect(system).toContain("## Spoken-rewrite spec");
            expect(system).toContain("## Grounding rule");
            expect(system).not.toContain("<!-- include");
        }
    });

    it("passes unmarked prompts through unchanged", () => {
        const raw = "Just rules.\n\nNothing else.";
        expect(loadModelPrompt(raw, REASONING)).toBe(`${raw}\n`);
        expect(loadModelPrompt(raw, CHAT)).toBe(`${raw}\n`);
    });

    it("returns null recap when the prompt has no recap block", () => {
        expect(
            loadModelPromptParts("No recap here.", CHAT).postTranscriptRecap,
        ).toBe(null);
    });
});
