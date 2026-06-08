import "server-only";

import type { CoachingMoment, DimensionalAnalysis } from "@/schemas";

/**
 * Em / en dashes are pure typography: when a sentence is *spoken*, there is no
 * audible dash — "Yes — we're on track" and "Yes, we're on track" sound
 * identical. So a dash never belongs in a field that holds words the learner is
 * meant to SAY (a turn rewrite, an "Improved Version", a `Try: "…"` line, a
 * `betterOption`). The analyzer prompts ask the model to avoid them, but the
 * same model that's asked to avoid them is the one emitting them — em dashes are
 * the single stickiest stylistic tic on current models — so prose-only
 * suppression is hope, not enforcement. This is the code-level floor, mirroring
 * `GENERIC_INSIGHT_STEMS` in `lib/captures/analyze.ts` and the focus-synthesizer
 * "belt and suspenders": the prompt reduces the rate, this guarantees the fix.
 *
 * The transform rewrites a dash used as a clause seam into the comma the line
 * actually has when spoken, and collapses the spacing. Numeric ranges ("3–5")
 * are left alone — those read as "three to five", not a spoken pause, and aren't
 * rewrite seams. Regular hyphens (`-`, as in "non-native", "60-second") are
 * never touched.
 */
export function despeechifyDashes(text: string): string {
    // Fast path: nothing dash-like, return untouched so callers that run this
    // line-by-line over markdown don't lose intentional whitespace.
    if (!/[—–―]|--/.test(text)) return text;

    const out = text
        // ASCII double-hyphen used as an em dash between words → audible comma.
        .replace(/(\w) ?-- ?(\w)/g, "$1, $2")
        // Unicode em / en / horizontal-bar dash used as a clause seam → comma,
        // unless it sits between digits (a numeric range like "3–5").
        .replace(/\s*[—–―]\s*/g, (match, offset: number, full: string) => {
            const before = full[offset - 1] ?? "";
            const after = full[offset + match.length] ?? "";
            if (/\d/.test(before) && /\d/.test(after)) return match;
            return ", ";
        });

    return out
        .replace(/ {2,}/g, " ") // collapse spaces the comma swap may have doubled
        .replace(/ +,/g, ",") // no space before a comma
        .replace(/,(?: *,)+/g, ",") // collapse comma pile-ups
        .replace(/^\s*,\s*/, "") // no leading comma (dash was sentence-initial)
        .replace(/\s*,\s*$/, "") // no dangling comma (dash was sentence-final)
        .trim();
}

/**
 * `improvedVersion` is spoken paragraphs interleaved with `> **Note:**`
 * blockquote coaching prose. Despeechify only the spoken paragraphs — the Note
 * lines are explanatory writing, where an em dash is legitimate, so leave them
 * (and the line structure) intact.
 */
function despeechifySpokenMarkdown(markdown: string): string {
    return markdown
        .split("\n")
        .map((line) => (line.trimStart().startsWith(">") ? line : despeechifyDashes(line)))
        .join("\n");
}

function despeechifyMoment<T extends CoachingMoment>(moment: T): T {
    // Only `betterOption` is the spoken target; `anchor` is the user's verbatim
    // words and `whyThisMatters` is explanatory prose — both left untouched.
    return { ...moment, betterOption: despeechifyDashes(moment.betterOption) };
}

function despeechifyDimension(dim: DimensionalAnalysis): DimensionalAnalysis {
    if (!Array.isArray(dim.findings)) return dim;
    return { ...dim, findings: dim.findings.map(despeechifyMoment) };
}

const DIMENSION_KEYS = [
    "structureAndFlow",
    "clarityAndConciseness",
    "relevanceAndFocus",
    "engagement",
    "professionalism",
] as const;

/**
 * Structural view of the analysis sub-fields that carry SPOKEN copy. Kept loose
 * (and all-optional) so one helper serves both the capture `ItemAnalysis` and
 * the drill `LlmSessionAnalysis` (whose `fixTheseFirst` lacks server indices,
 * and which has no `turnRewrites` / `coachingInsight`). Array covariance lets
 * the concrete moment/rewrite types flow in.
 */
type SpokenAnalysisLike = {
    fixTheseFirst?: CoachingMoment[];
    moreMoments?: CoachingMoment[];
    structureAndFlow?: DimensionalAnalysis;
    clarityAndConciseness?: DimensionalAnalysis;
    relevanceAndFocus?: DimensionalAnalysis;
    engagement?: DimensionalAnalysis;
    professionalism?: DimensionalAnalysis;
    turnRewrites?: { rewrite: string }[];
    coachingInsight?: { body: string } | null;
    improvedVersion?: string | null;
};

/**
 * Strip un-speakable dashes from every sub-field of an analysis that holds words
 * the learner is meant to say: `betterOption` (in `fixTheseFirst`, `moreMoments`,
 * and each dimensional `findings`), `turnRewrites[].rewrite`, `coachingInsight.body`,
 * and the drill `improvedVersion`. Verbatim user speech (`anchor` / `original` /
 * `quote`) and explanatory prose (`whyThisMatters`, `note`, `assessment`,
 * `headline`, `why`) are deliberately left alone. Returns a shallow-cloned copy;
 * the input is not mutated. Defensive about optional / malformed shapes so it is
 * safe to run over either modality's analysis.
 */
export function sanitizeSpokenFields<T extends SpokenAnalysisLike>(analysis: T): T {
    const next = { ...analysis } as Record<string, unknown>;

    if (Array.isArray(analysis.fixTheseFirst)) {
        next.fixTheseFirst = analysis.fixTheseFirst.map(despeechifyMoment);
    }
    if (Array.isArray(analysis.moreMoments)) {
        next.moreMoments = analysis.moreMoments.map(despeechifyMoment);
    }
    for (const key of DIMENSION_KEYS) {
        const dim = analysis[key];
        if (dim && typeof dim === "object" && Array.isArray(dim.findings)) {
            next[key] = despeechifyDimension(dim);
        }
    }
    if (Array.isArray(analysis.turnRewrites)) {
        next.turnRewrites = analysis.turnRewrites.map((t) => ({
            ...t,
            rewrite: despeechifyDashes(t.rewrite),
        }));
    }
    if (analysis.coachingInsight) {
        next.coachingInsight = {
            ...analysis.coachingInsight,
            body: despeechifyDashes(analysis.coachingInsight.body),
        };
    }
    if (typeof analysis.improvedVersion === "string" && analysis.improvedVersion) {
        next.improvedVersion = despeechifySpokenMarkdown(analysis.improvedVersion);
    }

    return next as T;
}
