import type { TurnRewrite } from "@/types/captures";

/**
 * Stitches turn rewrites into a single "read straight through" prose view.
 * For each entry: `keep` uses the original; everything else uses the rewrite.
 * Turns are joined as paragraphs — one per turn — with no speaker labels,
 * timestamps, or meta-text. Empty/whitespace-only entries are dropped.
 */
export function stitchTurnRewrites(turnRewrites: TurnRewrite[]): string {
    return turnRewrites
        .map((t) => (t.verdict === "keep" ? t.original : t.rewrite).trim())
        .filter((text) => text.length > 0)
        .join("\n\n");
}
