import "server-only";

import { isReasoningModel } from "./reasoning";

const EXAMPLES_START = /^<!--\s*examples:start\s*-->$/i;
const EXAMPLES_END = /^<!--\s*examples:end\s*-->$/i;

/**
 * Model-aware example policy for the analyzer prompts.
 *
 * Reasoning models (gpt-5 / o-series) do best with lean, near-zero-shot
 * prompts: heavy few-shot + counter-examples over-constrain them and get
 * imitated — this is literally how the em dash leaked (gpt-5-mini copied the
 * dashes in its own in-prompt examples). Fast models (gpt-4o-mini) are the
 * opposite: examples and counter-examples measurably help them.
 *
 * Our prompt `.md` files are authored with the full fast-model treatment, and
 * each purely-illustrative block (sample JSON output, `❌ FORBIDDEN`
 * counter-examples, multi-item "Examples:" lists) is wrapped in
 *
 *     <!-- examples:start -->
 *     …illustration…
 *     <!-- examples:end -->
 *
 * markers. When the prompt targets a reasoning model this strips those blocks;
 * for any model it always removes the marker lines themselves. The surrounding
 * rule prose is written to stand on its own, so the stripped version is still a
 * complete instruction. Unmarked prompts pass through unchanged (minus the
 * no-op marker scan), so this is safe to apply to every prompt read.
 */
export function loadModelPrompt(raw: string, model: string): string {
    const keepExamples = !isReasoningModel(model);
    const out: string[] = [];
    let depth = 0;

    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (EXAMPLES_START.test(trimmed)) {
            depth++;
            continue; // never emit the marker line
        }
        if (EXAMPLES_END.test(trimmed)) {
            if (depth > 0) depth--;
            continue; // never emit the marker line
        }
        if (depth > 0 && !keepExamples) continue; // drop example body for reasoning models
        out.push(line);
    }

    // Collapse blank-line runs left where a block was removed.
    return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
