import type { CaptureTranscriptLine, TranscriptCorrection } from "@/schemas";
import {
    MAX_CORRECTION_REPLACEMENT_CHARS,
    MAX_CORRECTION_SPAN_WORDS,
    MAX_CORRECTIONS_PER_CAPTURE,
    MAX_ASR_VOCABULARY_TERMS,
} from "@/schemas";

/**
 * Transcript-correction guards and overlay helpers.
 *
 * Deliberately NOT "server-only": the correction dialog runs the same guards
 * client-side (instant feedback, identical messages) and the transcript view
 * applies the overlay in the browser. The invariant everywhere: corrections
 * anchor to RAW transcript text by char offsets; display derives. Never feed
 * corrected text back into offset-sensitive code.
 */

/**
 * Pure fillers that can never be inside a corrected span — they ARE the
 * coaching signal. Deliberately conservative: ambiguous discourse words
 * ("like", "so", "well", "right", "actually") are NOT here, because they can
 * be genuinely misheard names/terms ("like" → "Mike") — the LLM mishearing
 * judge handles those.
 */
export const LOCKED_FILLER_TOKENS: ReadonlySet<string> = new Set([
    "um",
    "uh",
    "uhm",
    "umm",
    "er",
    "erm",
    "hmm",
    "mm",
]);

export const LOCKED_FILLER_BIGRAMS: ReadonlyArray<readonly [string, string]> =
    [
        ["you", "know"],
        ["i", "mean"],
    ];

/** Lowercase + strip edge punctuation so "Um," matches "um". */
export function normalizeToken(token: string): string {
    return token
        .toLowerCase()
        .replace(/^[^a-z0-9']+/, "")
        .replace(/[^a-z0-9']+$/, "");
}

export type LineToken = { text: string; start: number; end: number };

/** Whitespace tokenization with char offsets into the raw line text. */
export function tokenizeLine(text: string): LineToken[] {
    const tokens: LineToken[] = [];
    const re = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        tokens.push({
            text: match[0],
            start: match.index,
            end: match.index + match[0].length,
        });
    }
    return tokens;
}

/** True when the token (normalized) is a hard-locked filler. */
export function isLockedFillerToken(token: string): boolean {
    return LOCKED_FILLER_TOKENS.has(normalizeToken(token));
}

export type CorrectionCandidate = {
    transcriptIdx: number;
    charStart: number;
    charEnd: number;
    original: string;
    replacement: string;
};

export type GuardRejectionCode =
    | "line_not_found"
    | "span_out_of_bounds"
    | "span_not_token_aligned"
    | "original_mismatch"
    | "span_too_long"
    | "locked_filler_in_span"
    | "empty_replacement"
    | "replacement_too_long"
    | "overlaps_existing"
    | "overlaps_in_batch"
    | "capture_cap_reached";

export type GuardRejection = {
    code: GuardRejectionCode;
    /** User-facing copy — shown verbatim in the dialog. */
    message: string;
};

const GUARD_MESSAGES: Record<GuardRejectionCode, string> = {
    line_not_found: "That line couldn't be found. Please reload and try again.",
    span_out_of_bounds:
        "That selection couldn't be matched to the line. Please reload and try again.",
    span_not_token_aligned:
        "Please select whole words, not parts of a word.",
    original_mismatch:
        "That selection couldn't be matched to the line. Please reload and try again.",
    span_too_long: `Pick at most ${MAX_CORRECTION_SPAN_WORDS} words in a row.`,
    locked_filler_in_span:
        "That includes a word like 'um' or 'you know' — those stay as spoken, because they're part of how Sayzo coaches you.",
    empty_replacement: "Type what was really said.",
    replacement_too_long: "Keep the fix short — it replaces just a few words.",
    overlaps_existing: "That part of the line has already been fixed.",
    overlaps_in_batch: "Two of your fixes overlap — adjust one of them.",
    capture_cap_reached: `You've used all ${MAX_CORRECTIONS_PER_CAPTURE} fixes for this conversation.`,
};

function rejection(code: GuardRejectionCode): GuardRejection {
    return { code, message: GUARD_MESSAGES[code] };
}

function spansOverlap(
    a: { transcriptIdx: number; charStart: number; charEnd: number },
    b: { transcriptIdx: number; charStart: number; charEnd: number },
): boolean {
    return (
        a.transcriptIdx === b.transcriptIdx &&
        a.charStart < b.charEnd &&
        b.charStart < a.charEnd
    );
}

/**
 * All deterministic guards for one candidate. Returns the first rejection or
 * null when the candidate passes (it then still has to pass the LLM judge
 * server-side).
 */
export function checkCorrectionGuards(
    candidate: CorrectionCandidate,
    transcript: readonly CaptureTranscriptLine[],
    existing: readonly TranscriptCorrection[],
    earlierInBatch: readonly CorrectionCandidate[] = [],
): GuardRejection | null {
    if (existing.length + earlierInBatch.length >= MAX_CORRECTIONS_PER_CAPTURE) {
        return rejection("capture_cap_reached");
    }

    const line = transcript[candidate.transcriptIdx];
    if (!line) return rejection("line_not_found");

    const { charStart, charEnd } = candidate;
    if (
        !Number.isInteger(charStart) ||
        !Number.isInteger(charEnd) ||
        charStart < 0 ||
        charEnd <= charStart ||
        charEnd > line.text.length
    ) {
        return rejection("span_out_of_bounds");
    }

    // The span must start at a token start and end at a token end, covering
    // whole consecutive tokens only.
    const tokens = tokenizeLine(line.text);
    const firstIdx = tokens.findIndex((t) => t.start === charStart);
    const lastIdx = tokens.findIndex((t) => t.end === charEnd);
    if (firstIdx === -1 || lastIdx === -1 || lastIdx < firstIdx) {
        return rejection("span_not_token_aligned");
    }

    if (line.text.slice(charStart, charEnd) !== candidate.original) {
        return rejection("original_mismatch");
    }

    const spanTokens = tokens.slice(firstIdx, lastIdx + 1);
    if (spanTokens.length > MAX_CORRECTION_SPAN_WORDS) {
        return rejection("span_too_long");
    }

    const normalized = spanTokens.map((t) => normalizeToken(t.text));
    if (normalized.some((t) => LOCKED_FILLER_TOKENS.has(t))) {
        return rejection("locked_filler_in_span");
    }
    for (let i = 0; i < normalized.length - 1; i++) {
        for (const [a, b] of LOCKED_FILLER_BIGRAMS) {
            if (normalized[i] === a && normalized[i + 1] === b) {
                return rejection("locked_filler_in_span");
            }
        }
    }

    const replacement = candidate.replacement.trim();
    if (!replacement) return rejection("empty_replacement");
    if (
        replacement.length > MAX_CORRECTION_REPLACEMENT_CHARS ||
        replacement.split(/\s+/).length > MAX_CORRECTION_SPAN_WORDS + 2
    ) {
        return rejection("replacement_too_long");
    }

    if (existing.some((e) => spansOverlap(candidate, e))) {
        return rejection("overlaps_existing");
    }
    if (earlierInBatch.some((e) => spansOverlap(candidate, e))) {
        return rejection("overlaps_in_batch");
    }

    return null;
}

/**
 * Apply corrections to one raw line text. Splices right-to-left (descending
 * charStart) so earlier offsets stay valid; any correction whose `original`
 * no longer matches its slice is skipped — never guess.
 */
export function applyCorrectionsToLine(
    text: string,
    corrections: readonly TranscriptCorrection[],
): string {
    const sorted = [...corrections].sort((a, b) => b.charStart - a.charStart);
    let result = text;
    for (const c of sorted) {
        if (text.slice(c.charStart, c.charEnd) !== c.original) continue;
        result =
            result.slice(0, c.charStart) +
            c.replacement +
            result.slice(c.charEnd);
    }
    return result;
}

/** Group corrections by transcript line index. */
export function groupCorrectionsByIdx(
    corrections: readonly TranscriptCorrection[],
): Map<number, TranscriptCorrection[]> {
    const map = new Map<number, TranscriptCorrection[]>();
    for (const c of corrections) {
        const arr = map.get(c.transcriptIdx) ?? [];
        arr.push(c);
        map.set(c.transcriptIdx, arr);
    }
    return map;
}

/** Overlay the whole transcript. Returns a new array; input untouched. */
export function applyTranscriptCorrections(
    transcript: readonly CaptureTranscriptLine[],
    corrections: readonly TranscriptCorrection[],
): CaptureTranscriptLine[] {
    if (corrections.length === 0) return [...transcript];
    const byIdx = groupCorrectionsByIdx(corrections);
    return transcript.map((line, idx) => {
        const forLine = byIdx.get(idx);
        if (!forLine) return line;
        return { ...line, text: applyCorrectionsToLine(line.text, forLine) };
    });
}

/**
 * Render-time find/replace for analysis text quoting one turn (turnRewrite
 * `original`, teachable-moment `anchor`). Scoped to the corrections of that
 * turn, so cross-turn collisions are impossible; within the turn a short
 * `original` occurring twice may over-replace — accepted tradeoff, blast
 * radius is one displayed quote.
 */
export function applyCorrectionsToText(
    text: string,
    correctionsForTurn: readonly TranscriptCorrection[],
): string {
    let result = text;
    for (const c of correctionsForTurn) {
        result = result.split(c.original).join(c.replacement);
    }
    return result;
}

export type LineSegment =
    | { kind: "raw"; text: string; start: number; end: number }
    | {
          kind: "corrected";
          text: string;
          original: string;
          start: number;
          end: number;
      };

/**
 * Split a raw line into render segments so the UI can mark corrected ranges
 * (and the dialog can lock them). Offsets are into the RAW text; `text` of a
 * corrected segment is the replacement. Corrections that fail the integrity
 * check are ignored (the segment stays raw).
 */
export function segmentLineWithCorrections(
    text: string,
    corrections: readonly TranscriptCorrection[],
): LineSegment[] {
    const valid = corrections
        .filter((c) => text.slice(c.charStart, c.charEnd) === c.original)
        .sort((a, b) => a.charStart - b.charStart);

    const segments: LineSegment[] = [];
    let cursor = 0;
    for (const c of valid) {
        if (c.charStart > cursor) {
            segments.push({
                kind: "raw",
                text: text.slice(cursor, c.charStart),
                start: cursor,
                end: c.charStart,
            });
        }
        segments.push({
            kind: "corrected",
            text: c.replacement,
            original: c.original,
            start: c.charStart,
            end: c.charEnd,
        });
        cursor = c.charEnd;
    }
    if (cursor < text.length) {
        segments.push({
            kind: "raw",
            text: text.slice(cursor),
            start: cursor,
            end: text.length,
        });
    }
    return segments;
}

/**
 * Merge new vocabulary terms into the per-user ASR vocabulary: case-insensitive
 * dedupe (a re-added term moves to the back as most recent), capped at
 * MAX_ASR_VOCABULARY_TERMS by evicting the oldest.
 */
export function mergeVocabulary(
    existing: readonly string[],
    added: readonly string[],
): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();
    // Walk newest-last; later occurrences win, so iterate combined list and
    // keep the LAST occurrence of each case-insensitive key.
    const combined = [...existing, ...added.map((t) => t.trim()).filter(Boolean)];
    for (let i = combined.length - 1; i >= 0; i--) {
        const key = combined[i].toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.unshift(combined[i]);
    }
    return merged.slice(-MAX_ASR_VOCABULARY_TERMS);
}
