import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

import { isReasoningModel } from "./reasoning";

const BLOCK_START = /^<!--\s*(examples|chat):start\s*-->$/i;
const BLOCK_END = /^<!--\s*(examples|chat):end\s*-->$/i;
const RECAP_START = /^<!--\s*recap:start\s*-->$/i;
const RECAP_END = /^<!--\s*recap:end\s*-->$/i;
const INCLUDE = /^<!--\s*include:\s*(\S+)\s*-->$/i;

/**
 * Model-aware prompt loading for the analyzer prompts.
 *
 * Reasoning models (gpt-5 / o-series) do best with lean, near-zero-shot
 * prompts: heavy few-shot + counter-examples over-constrain them and get
 * imitated — this is literally how the em dash leaked (gpt-5-mini copied the
 * dashes in its own in-prompt examples) — and redundant scaffolding burns
 * reasoning tokens on reconciliation. Fast models (gpt-4o-mini) are the
 * opposite: examples, repetition, and a post-transcript recap measurably help
 * them. Our prompt `.md` files are authored with the full fast-model
 * treatment, annotated with markers this loader interprets per model class:
 *
 *   <!-- include: shared/foo.md -->   replaced with `prompts/shared/foo.md`
 *                                     (one level deep — included files may
 *                                     contain block markers but not further
 *                                     includes), so shared rule blocks have a
 *                                     single source of truth
 *   <!-- examples:start/end -->       purely-illustrative blocks (sample JSON,
 *                                     ❌ FORBIDDEN counter-examples, example
 *                                     lists) — kept for chat models, stripped
 *                                     for reasoning models
 *   <!-- chat:start/end -->           chat-only rule redundancy / procedural
 *                                     scaffolding — same strip semantics as
 *                                     `examples`, semantically distinct
 *   <!-- recap:start/end -->          a short rule recap that must land AFTER
 *                                     the transcript in the user message
 *                                     (chat models weigh late instructions
 *                                     heavier) — always removed from the
 *                                     system prompt, returned separately for
 *                                     chat models, dropped for reasoning ones
 *
 * Marker lines themselves are never emitted. The surrounding rule prose is
 * written to stand on its own, so the stripped version is still a complete
 * instruction. Unmarked prompts pass through unchanged (minus the no-op
 * marker scan), so this is safe to apply to every prompt read.
 */
export function loadModelPromptParts(
    raw: string,
    model: string,
): { system: string; postTranscriptRecap: string | null } {
    const keepExamples = !isReasoningModel(model);
    const out: string[] = [];
    const recap: string[] = [];
    let depth = 0;
    let inRecap = false;

    for (const line of expandIncludes(raw).split("\n")) {
        const trimmed = line.trim();
        if (RECAP_START.test(trimmed)) {
            inRecap = true;
            continue; // never emit the marker line
        }
        if (RECAP_END.test(trimmed)) {
            inRecap = false;
            continue;
        }
        if (BLOCK_START.test(trimmed)) {
            depth++;
            continue;
        }
        if (BLOCK_END.test(trimmed)) {
            if (depth > 0) depth--;
            continue;
        }
        if (inRecap) {
            recap.push(line); // recap never belongs in the system prompt
            continue;
        }
        if (depth > 0 && !keepExamples) continue; // drop example/chat body for reasoning models
        out.push(line);
    }

    const recapText = recap.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return {
        // Collapse blank-line runs left where a block was removed.
        system: `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`,
        postTranscriptRecap: keepExamples && recapText ? recapText : null,
    };
}

/** Back-compat wrapper for call sites that don't use the recap. */
export function loadModelPrompt(raw: string, model: string): string {
    return loadModelPromptParts(raw, model).system;
}

// Includes resolve against `prompts/` and the deployed files are static, so
// cache reads for the life of the server process in production. In dev, skip
// the cache so edits to an included file show up without a restart (callers
// already re-read their main prompt per call via readFileSync).
const includeCache = new Map<string, string>();

function expandIncludes(raw: string): string {
    if (!/<!--\s*include:/i.test(raw)) return raw;
    return raw
        .split("\n")
        .map((line) => {
            const match = INCLUDE.exec(line.trim());
            if (!match) return line;
            return readInclude(match[1]);
        })
        .join("\n");
}

function readInclude(relPath: string): string {
    const cached = includeCache.get(relPath);
    if (cached !== undefined && process.env.NODE_ENV === "production") {
        return cached;
    }
    // One level only: an include inside an included file is left as-is (it
    // would otherwise hide circular-include bugs behind a cache).
    const content = readFileSync(
        join(process.cwd(), "prompts", relPath),
        "utf-8",
    ).trim();
    includeCache.set(relPath, content);
    return content;
}
