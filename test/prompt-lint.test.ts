import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadModelPromptParts } from "@/lib/openai/prompt";
import { despeechifySpokenPunctuation } from "@/lib/text/despeechify";

/**
 * Guardrail for the prompt files themselves: one bad few-shot example silently
 * re-teaches the failure mode the rules forbid (models copy examples over
 * rules), so the example blocks are linted like code.
 */

const PROMPT_FILES = [
    "captures/deep-analysis.md",
    "analyzer/session-analysis.md",
    "analyzer/session-feedback.md",
];

const REASONING = "gpt-5-mini";
const CHAT = "gpt-4o-mini";

function readPromptFile(rel: string): string {
    return readFileSync(join(process.cwd(), "prompts", rel), "utf-8");
}

// Lines that define spoken-field content in examples: JSON keys and the
// arrow-style markdown examples.
const SPOKEN_FIELD_LINE =
    /(^\s*"(betterOption|rewrite|body)"\s*:)|(betterOption \*")/;

function quotedSpans(line: string): string[] {
    const spans: string[] = [];
    for (const re of [/"([^"\n]+)"/g, /“([^”\n]+)”/g]) {
        for (const m of line.matchAll(re)) spans.push(m[1]);
    }
    return spans;
}

describe.each(PROMPT_FILES)("prompt lint: %s", (rel) => {
    const raw = readPromptFile(rel);

    it("loads without leaking markers for either model class", () => {
        for (const model of [REASONING, CHAT]) {
            const { system, postTranscriptRecap } = loadModelPromptParts(
                raw,
                model,
            );
            expect(system).not.toMatch(/<!--/);
            expect(postTranscriptRecap ?? "").not.toMatch(/<!--/);
        }
    });

    it("contains the shared spoken-rewrite spec exactly once", () => {
        for (const model of [REASONING, CHAT]) {
            const { system } = loadModelPromptParts(raw, model);
            const hits = system.match(/## Spoken-rewrite spec/g) ?? [];
            expect(hits).toHaveLength(1);
            expect(system).toContain("## Grounding rule");
        }
    });

    it("has a post-transcript recap for chat models only", () => {
        expect(loadModelPromptParts(raw, CHAT).postTranscriptRecap).toBeTruthy();
        expect(loadModelPromptParts(raw, REASONING).postTranscriptRecap).toBe(
            null,
        );
    });

    it("has no unspeakable punctuation in example spoken wording", () => {
        const { system } = loadModelPromptParts(raw, CHAT);
        for (const fileLine of system.split("\n")) {
            if (!SPOKEN_FIELD_LINE.test(fileLine)) continue;
            for (const span of quotedSpans(fileLine)) {
                // The Try-framing colon is legitimate coach voice, not spoken.
                const spoken = span.replace(/^\s*try[:,]?\s*/i, "");
                expect(
                    despeechifySpokenPunctuation(spoken),
                    `unspeakable punctuation in example span of ${rel}: ${span}`,
                ).toBe(spoken);
            }
        }
    });
});
