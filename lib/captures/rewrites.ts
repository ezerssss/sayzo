import type { TurnRewrite } from "@/schemas";

/**
 * Stitches turn rewrites into a single "read straight through" prose view.
 * For each entry: `keep` uses the original; `non_english` is skipped entirely
 * (the read-through is the user's English contribution — stitching garbled
 * non-English text in would misrepresent it as their words); everything else
 * uses the rewrite. Turns are joined as paragraphs — one per turn — with no
 * speaker labels, timestamps, or meta-text. Empty/whitespace-only entries are
 * dropped.
 */
export function stitchTurnRewrites(turnRewrites: TurnRewrite[]): string {
    return turnRewrites
        .map((t) => {
            if (t.verdict === "non_english") return "";
            return (t.verdict === "keep" ? t.original : t.rewrite).trim();
        })
        .filter((text) => text.length > 0)
        .join("\n\n");
}
