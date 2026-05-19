// Echo-leak suppression for stereo captures.
//
// Two detectors run in parallel at the transcribe stage, OR-composed:
//
// 1. `isEchoLeakUtterance` — energy-based. Compares left/right RMS during
//    the c0 utterance vs concurrent c1 utterances. Catches loud-residual
//    bleed (laptop speakers near mic, k≈0.5-0.8 → right/left ratio 1.2-2.0,
//    so 2.0 is the floor without false-dropping real users) and Deepgram c0
//    hallucinations emitted over `echo_guard`-zeroed spans (meanLeft==0
//    branch).
//
// 2. `isPhoneticEchoOfOtherChannel` — transcript-based. Catches degraded-
//    but-recognizable echo that survived agent-side AEC and slipped past
//    the energy ratio gate. Compares phonetic encoding (double-metaphone)
//    of c0 against nearby c1 utterances using a confidence floor as the
//    safeguard.
//
// The phonetic detector exists because, post-agent-v3.6.0, WebRTC AEC3
// actually works (-25 dB silent, -4 to -10 dB during double-talk) — which
// means surviving bleed often has c1-channel amplitude similar to or below
// c0, defeating the right/left ratio test. The transcript is the next
// signal up the stack.
//
// Why phonetic + confidence is not the naked text-similarity check this
// file's earlier guidance warned against:
//
//   Reiteration (legitimate coaching content): user speaks clearly →
//   Deepgram confidence ~0.9+ → confidence floor short-circuits the check
//   → utterance preserved. See test "phonetic match with high confidence
//   is preserved (reiteration invariant)" in echo-leak.test.ts.
//
//   Echo bleed (the bug we're catching): AEC residual is acoustically
//   degraded (smeared formants, reverb) → Deepgram confidence drops →
//   detector engages and drops the utterance.
//
// The confidence floor is load-bearing. Do not remove it without
// reworking the phonetic detector to find a different reiteration-vs-bleed
// discriminator.

import { doubleMetaphone } from "double-metaphone";
import leven from "fast-levenshtein";

export const ECHO_RIGHT_OVER_LEFT_RATIO = 2.0;
export const ECHO_VOICED_BIN_FLOOR_RMS = 0.005;
export const ECHO_MIN_UTTERANCE_MS = 200;
export const ECHO_MIN_C1_OVERLAP_FRACTION = 0.6;
export const ECHO_MIN_VOICED_BINS = 3;

// Phonetic detector constants. Conservative starting values — tune after
// inspecting production captures (notably `89f515f9fd10` and similar).
export const ECHO_C0_CONFIDENCE_FLOOR = 0.8;
export const ECHO_MIN_C0_WORDS = 2;
export const ECHO_MAX_C1_GAP_SECS = 2.0;
export const ECHO_PHONETIC_COVERAGE_THRESHOLD = 0.55;
export const ECHO_PHONETIC_CODE_MIN_LEN = 2;
export const ECHO_PHONETIC_EDIT_TOLERANCE = 1;

export const ECHO_LEAK_RULE_VERSION = "v2";

export type EchoUtteranceWindow = {
    start: number;
    end: number;
};

export type EchoEnergyView = {
    binMs: number;
    leftRmsBins: Float32Array;
    rightRmsBins: Float32Array;
};

export type EchoTextWindow = {
    start: number;
    end: number;
    text: string;
};

export type EchoC0Window = EchoTextWindow & {
    confidence: number;
};

export function isEchoLeakUtterance(
    u: EchoUtteranceWindow,
    energy: EchoEnergyView,
    c1Intervals: EchoUtteranceWindow[],
): boolean {
    const durSec = u.end - u.start;
    if (durSec <= 0) return false;
    if (durSec * 1000 < ECHO_MIN_UTTERANCE_MS) return false;

    let overlapSec = 0;
    for (const iv of c1Intervals) {
        const o = Math.max(
            0,
            Math.min(u.end, iv.end) - Math.max(u.start, iv.start),
        );
        overlapSec += o;
    }
    const overlapFrac = Math.min(1, overlapSec / durSec);
    if (overlapFrac < ECHO_MIN_C1_OVERLAP_FRACTION) return false;

    const binMs = energy.binMs;
    const totalBins = energy.leftRmsBins.length;
    const startBin = Math.max(0, Math.floor((u.start * 1000) / binMs));
    const endBin = Math.min(totalBins, Math.ceil((u.end * 1000) / binMs));
    if (endBin <= startBin) return false;

    let leftSum = 0;
    let rightSum = 0;
    let voiced = 0;
    for (let i = startBin; i < endBin; i++) {
        const l = energy.leftRmsBins[i];
        const r = energy.rightRmsBins[i];
        if (Math.max(l, r) < ECHO_VOICED_BIN_FLOOR_RMS) continue;
        leftSum += l;
        rightSum += r;
        voiced++;
    }
    if (voiced < ECHO_MIN_VOICED_BINS) return false;

    const meanLeft = leftSum / voiced;
    const meanRight = rightSum / voiced;

    // Voiced bins exist but left sums to exactly zero: Deepgram transcribed
    // a region of -∞ dBFS silence — a hallucination emitted over a span that
    // echo_guard zeroed out on the agent. Drop. Taper-edge bins fall through
    // to the ratio test below (huge ratio → still drops), so this branch is
    // only exact-silence; RMS ≥ 0 makes <= 0 equivalent to == 0.
    if (meanLeft <= 0) return true;

    return meanRight > meanLeft * ECHO_RIGHT_OVER_LEFT_RATIO;
}

/**
 * Tokenize text into words (lowercase, alpha-only) and encode each with the
 * double-metaphone primary code. Empty codes (very short or all-punctuation
 * inputs) are dropped.
 */
function encodeWords(text: string): string[] {
    const words = text
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 0);
    const codes: string[] = [];
    for (const w of words) {
        const code = doubleMetaphone(w)[0];
        if (code.length > 0) codes.push(code);
    }
    return codes;
}

/**
 * Build a Set of c1 phonetic n-grams (unigrams + adjacent bigrams) above the
 * min-length floor. Bigrams catch cases like "seatback" (1 word, code STPK)
 * vs "steam back" (2 words, codes STM + PK that concatenate to STMPK).
 */
function phoneticNgramSet(codes: string[]): Set<string> {
    const out = new Set<string>();
    for (const c of codes) {
        if (c.length >= ECHO_PHONETIC_CODE_MIN_LEN) out.add(c);
    }
    for (let i = 0; i < codes.length - 1; i++) {
        const bg = codes[i] + codes[i + 1];
        if (bg.length >= ECHO_PHONETIC_CODE_MIN_LEN + 1) out.add(bg);
    }
    return out;
}

function withinEditTolerance(
    a: string,
    b: string,
    tolerance: number,
): boolean {
    if (a === b) return true;
    // Short codes (2 chars) match a huge fraction of all other 2-char codes
    // under tolerance=1 by chance — "AS" vs "AR" is one edit but means
    // nothing. Require exact match unless both codes carry real length.
    const minLen = Math.min(a.length, b.length);
    if (minLen < 3) return false;
    if (Math.abs(a.length - b.length) > tolerance) return false;
    return leven.get(a, b) <= tolerance;
}

function anyNgramMatches(code: string, c1Ngrams: Iterable<string>): boolean {
    for (const ng of c1Ngrams) {
        if (withinEditTolerance(code, ng, ECHO_PHONETIC_EDIT_TOLERANCE)) {
            return true;
        }
    }
    return false;
}

/**
 * Fraction of c0's meaningful words (phonetic code ≥ 2 chars) that match
 * some n-gram in c1. Single-char codes ("A" for "oh", "S" for "so") are
 * ignored — they're too common to carry signal.
 */
function c1CoverageOfC0(c0Codes: string[], c1Ngrams: Set<string>): number {
    const covered = new Set<number>();
    let meaningfulC0 = 0;
    for (let i = 0; i < c0Codes.length; i++) {
        if (c0Codes[i].length < ECHO_PHONETIC_CODE_MIN_LEN) continue;
        meaningfulC0++;
        if (anyNgramMatches(c0Codes[i], c1Ngrams)) {
            covered.add(i);
            continue;
        }
        if (i < c0Codes.length - 1) {
            const bg = c0Codes[i] + c0Codes[i + 1];
            if (anyNgramMatches(bg, c1Ngrams)) {
                covered.add(i);
                if (c0Codes[i + 1].length >= ECHO_PHONETIC_CODE_MIN_LEN) {
                    covered.add(i + 1);
                }
            }
        }
    }
    if (meaningfulC0 === 0) return 0;
    let coveredMeaningful = 0;
    for (const i of covered) {
        if (c0Codes[i].length >= ECHO_PHONETIC_CODE_MIN_LEN) coveredMeaningful++;
    }
    return coveredMeaningful / meaningfulC0;
}

/**
 * Detect a c0 utterance that is a phonetic shadow of a recent c1 utterance.
 *
 * Returns true only when ALL of:
 *   1. c0 Deepgram confidence is below the floor (degraded audio signature)
 *   2. c0 has at least ECHO_MIN_C0_WORDS phonetic tokens
 *   3. Some c1 window ending within ECHO_MAX_C1_GAP_SECS before c0 starts
 *      (or overlapping c0) covers ≥ ECHO_PHONETIC_COVERAGE_THRESHOLD of c0
 *
 * Reiteration is preserved because clean user speech produces high
 * confidence (~0.9+), failing gate #1.
 */
export function isPhoneticEchoOfOtherChannel(
    c0: EchoC0Window,
    c1Windows: EchoTextWindow[],
): boolean {
    if (c0.confidence >= ECHO_C0_CONFIDENCE_FLOOR) return false;

    const c0Codes = encodeWords(c0.text);
    if (c0Codes.length < ECHO_MIN_C0_WORDS) return false;

    let bestCoverage = 0;
    for (const c1 of c1Windows) {
        if (c1.start > c0.end) continue;
        const gap = c0.start - c1.end;
        if (gap > ECHO_MAX_C1_GAP_SECS) continue;

        const c1Codes = encodeWords(c1.text);
        if (c1Codes.length === 0) continue;
        const c1Ngrams = phoneticNgramSet(c1Codes);
        if (c1Ngrams.size === 0) continue;

        const coverage = c1CoverageOfC0(c0Codes, c1Ngrams);
        if (coverage > bestCoverage) bestCoverage = coverage;
        if (bestCoverage >= ECHO_PHONETIC_COVERAGE_THRESHOLD) return true;
    }

    return bestCoverage >= ECHO_PHONETIC_COVERAGE_THRESHOLD;
}
