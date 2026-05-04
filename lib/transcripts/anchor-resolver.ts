import type { CaptureTranscriptLine } from "@/types/captures";

/**
 * Programmatic resolution of a coaching anchor (a quoted phrase from the
 * user's speech) to its position in the transcript.
 *
 * Why this exists: the analyzer LLM used to emit `transcriptIdx` and
 * `timestamp` directly. LLMs hallucinate numbers — a plausible-but-wrong
 * `transcriptIdx` would sail through any "is it in bounds?" check, and the
 * coaching badge would render against the wrong line. Now the LLM emits only
 * the verbatim anchor text and the server finds where it actually occurred.
 *
 * The resolver tries three paths in order:
 *   1. **exact**  — the normalized anchor is a substring of one (or more)
 *                   normalized line(s). On multi-match, prefer the longest
 *                   line (most specific context).
 *   2. **span**   — the anchor doesn't fit in any single line, so it spans
 *                   consecutive utterances (the user paused mid-thought and
 *                   Deepgram split the line). Concatenate normalized lines
 *                   with offsets, find the anchor's start position, return
 *                   the line that contains that start.
 *   3. **fuzzy**  — the LLM ignored the verbatim contract and paraphrased.
 *                   Pick the line with the longest contiguous run of anchor
 *                   tokens, requiring run length >= 3.
 *
 * Anything that doesn't resolve through one of those is dropped by
 * `reconcileMoments` — better to lose a hallucinated coaching moment than
 * to render it against the wrong line.
 */

export type AnchorConfidence = "exact" | "span" | "fuzzy" | "unresolved";

export type ResolvedAnchor = {
    /** Index into the original `lines` array, or -1 when unresolved. */
    idx: number;
    /** `lines[idx].start` when resolved; 0 when unresolved. */
    timestamp: number;
    confidence: AnchorConfidence;
};

const FILLER_TOKENS = new Set([
    "um",
    "uh",
    "er",
    "erm",
    "uhm",
    "mm",
    "hmm",
]);

function normalize(value: string): string {
    return value
        .toLowerCase()
        .replaceAll(/[^a-z0-9\s]+/g, " ")
        .replaceAll(/\s+/g, " ")
        .trim();
}

function tokenize(value: string): string[] {
    const normalized = normalize(value);
    if (!normalized) return [];
    return normalized.split(" ").filter((t) => t.length > 0 && !FILLER_TOKENS.has(t));
}

/**
 * Length of the longest contiguous subsequence of `anchorTokens` that also
 * appears (in the same order) inside `lineTokens`. Used as the fuzzy
 * fallback when the verbatim substring search fails.
 */
function longestContiguousRun(
    anchorTokens: readonly string[],
    lineTokens: readonly string[],
): number {
    if (anchorTokens.length === 0 || lineTokens.length === 0) return 0;
    let best = 0;
    for (let i = 0; i < anchorTokens.length; i++) {
        for (let j = 0; j < lineTokens.length; j++) {
            if (anchorTokens[i] !== lineTokens[j]) continue;
            let run = 0;
            while (
                i + run < anchorTokens.length &&
                j + run < lineTokens.length &&
                anchorTokens[i + run] === lineTokens[j + run]
            ) {
                run++;
            }
            if (run > best) best = run;
        }
    }
    return best;
}

export type ResolveAnchorArgs = {
    anchor: string;
    lines: readonly CaptureTranscriptLine[];
    /**
     * Restrict matching to a subset of lines (e.g. only `speaker === "user"`
     * for captures, where coaching moments must anchor on user turns).
     * Returned `idx` is still the original index into `lines`.
     */
    speakerFilter?: (line: CaptureTranscriptLine) => boolean;
};

export function resolveAnchorIdx(args: ResolveAnchorArgs): ResolvedAnchor {
    const { anchor, lines, speakerFilter } = args;

    const searchable: { origIdx: number; line: CaptureTranscriptLine }[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (!speakerFilter || speakerFilter(line)) {
            searchable.push({ origIdx: i, line });
        }
    }
    if (searchable.length === 0) {
        return { idx: -1, timestamp: 0, confidence: "unresolved" };
    }

    const normAnchor = normalize(anchor);
    if (!normAnchor) {
        return { idx: -1, timestamp: 0, confidence: "unresolved" };
    }

    const normLines = searchable.map((s) => normalize(s.line.text));

    // 1) Exact: anchor fits inside some line as a normalized substring.
    const exactMatches: number[] = [];
    for (let i = 0; i < normLines.length; i++) {
        if (normLines[i].includes(normAnchor)) exactMatches.push(i);
    }
    if (exactMatches.length > 0) {
        let best = exactMatches[0]!;
        for (const i of exactMatches) {
            if (normLines[i]!.length > normLines[best]!.length) best = i;
        }
        const orig = searchable[best]!.origIdx;
        return {
            idx: orig,
            timestamp: lines[orig]!.start,
            confidence: "exact",
        };
    }

    // 2) Span: anchor crosses consecutive utterances (Deepgram split a
    //    slow-spoken sentence). Concatenate, find start offset, map back to
    //    the line containing that start. Anchor on the first line of the
    //    span — that's where the user began saying it.
    const SEP = " ";
    const lineStarts: number[] = [];
    let offset = 0;
    for (const nl of normLines) {
        lineStarts.push(offset);
        offset += nl.length + SEP.length;
    }
    const concat = normLines.join(SEP);
    const matchOffset = concat.indexOf(normAnchor);
    if (matchOffset >= 0) {
        let local = 0;
        for (let i = 0; i < lineStarts.length; i++) {
            if (lineStarts[i]! <= matchOffset) local = i;
            else break;
        }
        const orig = searchable[local]!.origIdx;
        return {
            idx: orig,
            timestamp: lines[orig]!.start,
            confidence: "span",
        };
    }

    // 3) Fuzzy: LLM paraphrased. Find the line with the longest contiguous
    //    run of anchor tokens; require >=3 to avoid noise from "I think"
    //    style coincidences.
    const anchorTokens = tokenize(anchor);
    if (anchorTokens.length >= 3) {
        let bestRun = 0;
        let bestLocal = -1;
        for (let i = 0; i < searchable.length; i++) {
            const run = longestContiguousRun(
                anchorTokens,
                tokenize(searchable[i]!.line.text),
            );
            if (run > bestRun) {
                bestRun = run;
                bestLocal = i;
            }
        }
        if (bestLocal >= 0 && bestRun >= 3) {
            const orig = searchable[bestLocal]!.origIdx;
            return {
                idx: orig,
                timestamp: lines[orig]!.start,
                confidence: "fuzzy",
            };
        }
    }

    return { idx: -1, timestamp: 0, confidence: "unresolved" };
}

/**
 * Reconcile a list of items that quote the user (e.g. coaching moments,
 * turn rewrites, grammar examples) by resolving each item's anchor text
 * against the transcript. Items that resolve get `transcriptIdx` and
 * `timestamp` filled from the transcript; items that don't are dropped.
 *
 * `getAnchor` extracts the verbatim quote field on the item (e.g. `anchor`
 * for `TeachableMoment`, `original` for `TurnRewrite`, `text` for grammar
 * examples).
 */
export function reconcileWithAnchor<T, R>(
    items: readonly T[],
    getAnchor: (item: T) => string,
    setResolved: (item: T, idx: number, timestamp: number) => R,
    lines: readonly CaptureTranscriptLine[],
    speakerFilter?: (line: CaptureTranscriptLine) => boolean,
): R[] {
    const out: R[] = [];
    for (const item of items) {
        const resolved = resolveAnchorIdx({
            anchor: getAnchor(item),
            lines,
            speakerFilter,
        });
        if (resolved.confidence === "unresolved") continue;
        out.push(setResolved(item, resolved.idx, resolved.timestamp));
    }
    return out;
}

/**
 * Convenience wrapper for the common case: items shaped like
 * `{ anchor: string, ... }` that need `transcriptIdx` + `timestamp`
 * filled in.
 */
export function reconcileMoments<T extends { anchor: string }>(
    moments: readonly T[],
    lines: readonly CaptureTranscriptLine[],
    speakerFilter?: (line: CaptureTranscriptLine) => boolean,
): (T & { transcriptIdx: number; timestamp: number })[] {
    return reconcileWithAnchor(
        moments,
        (m) => m.anchor,
        (m, idx, timestamp) => ({ ...m, transcriptIdx: idx, timestamp }),
        lines,
        speakerFilter,
    );
}

export const __test = { normalize, tokenize, longestContiguousRun };
