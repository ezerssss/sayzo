import type { CaptureTranscriptLine } from "@/types/captures";

// Short user utterances are echo-bleed false-positive risk (phonetic match
// on 1-2 words is unreliable in lib/captures/echo-leak.ts) AND have no
// coaching value as drill seeds. Hiding them from the LLMs that derive
// drill content (analyzer + replay-planner) prevents short bleed fragments
// from being anchored as teachable moments.
//
// The unfiltered `serverTranscript` stays in Firestore for archival/audit;
// these helpers only affect what the LLM sees.
export const DRILL_USER_MIN_WORDS = 3;

function userWordCount(text: string): number {
    return text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
}

/**
 * Returns true when a transcript line is a user utterance below the drill
 * min-word floor. Use this when callers must preserve original-transcript
 * indices (e.g., the analyzer LLM emits idx-typed fields that get stored
 * verbatim) — pass to a formatter that skips matching lines.
 */
export function isShortUserDrillLine(line: CaptureTranscriptLine): boolean {
    if (line.speaker !== "user") return false;
    return userWordCount(line.text) < DRILL_USER_MIN_WORDS;
}

/**
 * Drop short user-channel lines from the array. Use when the caller does
 * not rely on the original indices (e.g., the replay planner doesn't emit
 * transcriptIdx fields).
 */
export function filterDrillCandidateTranscript(
    transcript: CaptureTranscriptLine[],
): CaptureTranscriptLine[] {
    return transcript.filter((l) => !isShortUserDrillLine(l));
}
