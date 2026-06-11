import "server-only";

import type { CoachingMoment, DimensionalAnalysis } from "@/schemas";

/**
 * Written-prose punctuation is pure typography: when a sentence is *spoken*,
 * there is no audible dash, semicolon, defining colon, or bracket — "Yes — we're
 * on track", "Yes; we're on track", and "Yes, we're on track" all sound
 * identical. So none of them belong in a field that holds words the learner is
 * meant to SAY (a turn rewrite, an "Improved Version", a `Try: "…"` line, a
 * `betterOption`). The analyzer prompts ask the model to avoid them, but the
 * same model that's asked to avoid them is the one emitting them — em dashes
 * are the single stickiest stylistic tic on current models, colons the next —
 * so prose-only suppression is hope, not enforcement. This is the code-level
 * floor, mirroring `GENERIC_INSIGHT_STEMS` in `lib/captures/analyze.ts` and the
 * focus-synthesizer "belt and suspenders": the prompt reduces the rate, this
 * guarantees the fix.
 *
 * The transforms rewrite punctuation used as a clause seam into the comma the
 * line actually has when spoken, and collapse the spacing. Numeric uses are
 * left alone — "3–5" reads as "three to five", "3:30" as a time, "2:1" as a
 * ratio; none are rewrite seams. Regular hyphens (`-`, as in "non-native",
 * "60-second") are never touched.
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

    return cleanupSeams(out);
}

/** Shared cleanup after a punctuation→comma swap. */
function cleanupSeams(text: string): string {
    return text
        .replace(/ {2,}/g, " ") // collapse spaces the comma swap may have doubled
        .replace(/ +,/g, ",") // no space before a comma
        .replace(/,(?: *,)+/g, ",") // collapse comma pile-ups
        .replace(/^\s*,\s*/, "") // no leading comma (seam was sentence-initial)
        .replace(/\s*,\s*$/, "") // no dangling comma (seam was sentence-final)
        .trim();
}

/**
 * The full unspeakable-punctuation floor, for fields that are PURE spoken text
 * (`turnRewrites[].rewrite`, the spoken paragraphs of `improvedVersion`): on
 * top of the dash transform, rewrite semicolon and defining-colon clause seams
 * as commas (digit-flanked colons like "3:30" / "2:1" stay), and strip short
 * bracketed meta-annotations (`[claim]`) the prompts forbid. Do NOT run this
 * over fields that mix coach framing with quoted speech — the framing colon in
 * `Try: "…"` is legitimate there; use `despeechifyQuotedSpans` instead.
 */
export function despeechifySpokenPunctuation(text: string): string {
    let out = despeechifyDashes(text);
    if (!/[;:[\]]/.test(out)) return out;

    out = out
        // Bracketed annotations are meta-text, never spoken — drop them.
        .replace(/\s*\[[^\]\n]{1,40}\]/g, " ")
        // Semicolon clause seam → audible comma.
        .replace(/\s*;\s*/g, ", ")
        // Defining-colon clause seam → comma, unless digit-flanked (times,
        // ratios) — same guard shape as the dash numeric-range exemption.
        .replace(/\s*:\s*/g, (match, offset: number, full: string) => {
            const before = full[offset - 1] ?? "";
            const after = full[offset + match.length] ?? "";
            if (/\d/.test(before) && /\d/.test(after)) return match;
            return ", ";
        });

    return cleanupSeams(out);
}

/**
 * The floor for fields that legitimately mix coach framing with quoted spoken
 * wording (`betterOption`, `coachingInsight.body`): dashes are stripped from
 * the whole field (they're never legitimate, framing included), but the
 * semicolon/colon/bracket floor runs ONLY inside double-quoted spans — so
 * `Try: "…"` and `Lead with the recommendation, then the trade-offs: "…"` keep
 * their framing colon while a colon *inside* the words-to-say transforms.
 *
 * Deliberate limitation: single-quoted spans are not matched — apostrophes in
 * contractions ("I'd", "it's") make naive single-quote pairing a false-positive
 * machine. The prompts now require double quotes around all spoken wording;
 * residual single-quoted spans stay prompt-enforced only.
 */
export function despeechifyQuotedSpans(text: string): string {
    const out = despeechifyDashes(text);
    return out
        .replace(/"([^"\n]+)"/g, (_m, inner: string) => `"${despeechifySpokenPunctuation(inner)}"`)
        .replace(/“([^”\n]+)”/g, (_m, inner: string) => `“${despeechifySpokenPunctuation(inner)}”`);
}

/**
 * `improvedVersion` is spoken paragraphs interleaved with `> **Note:**`
 * blockquote coaching prose. Apply the full spoken-punctuation floor only to
 * the spoken paragraphs — the Note lines are explanatory writing, where an em
 * dash or colon is legitimate, so leave them (and the line structure) intact.
 */
function despeechifySpokenMarkdown(markdown: string): string {
    return markdown
        .split("\n")
        .map((line) =>
            line.trimStart().startsWith(">")
                ? line
                : despeechifySpokenPunctuation(line),
        )
        .join("\n");
}

function despeechifyMoment<T extends CoachingMoment>(moment: T): T {
    // Only `betterOption` carries spoken wording; `anchor` is the user's
    // verbatim words and `whyThisMatters` is explanatory prose — both left
    // untouched. betterOption mixes framing + quoted speech, so it gets the
    // quoted-span treatment.
    return { ...moment, betterOption: despeechifyQuotedSpans(moment.betterOption) };
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
 * Strip un-speakable punctuation from every sub-field of an analysis that holds
 * words the learner is meant to say: `betterOption` (in `fixTheseFirst`,
 * `moreMoments`, and each dimensional `findings`) and `coachingInsight.body`
 * get the quoted-span floor (framing kept, quoted speech cleaned);
 * `turnRewrites[].rewrite` and the drill `improvedVersion` are pure spoken text
 * and get the full floor. Verbatim user speech (`anchor` / `original` /
 * `quote`) and explanatory prose (`whyThisMatters`, `note`, `assessment`,
 * `headline`, `why`) are deliberately left alone. Returns a shallow-cloned
 * copy; the input is not mutated. Defensive about optional / malformed shapes
 * so it is safe to run over either modality's analysis.
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
            rewrite: despeechifySpokenPunctuation(t.rewrite),
        }));
    }
    if (analysis.coachingInsight) {
        next.coachingInsight = {
            ...analysis.coachingInsight,
            body: despeechifyQuotedSpans(analysis.coachingInsight.body),
        };
    }
    if (typeof analysis.improvedVersion === "string" && analysis.improvedVersion) {
        next.improvedVersion = despeechifySpokenMarkdown(analysis.improvedVersion);
    }

    return next as T;
}
