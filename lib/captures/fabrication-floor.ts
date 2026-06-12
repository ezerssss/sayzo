import type { CaptureTranscriptLine } from "@/schemas";

/**
 * Transcript-grounding floor shared by the LLM surfaces that may only restate
 * what a conversation actually contained: coaching-insight bodies
 * (`lib/captures/analyze.ts`) and meeting-summary notes
 * (`lib/captures/meeting-summary.ts`).
 */

export const SPELLED_INTEGERS = [
    "zero", "one", "two", "three", "four", "five", "six",
    "seven", "eight", "nine", "ten", "eleven", "twelve",
];

// Proper-noun-shaped tokens that are normal in any rewrite regardless of the
// transcript. Deliberately tiny — weekdays/months are NOT here, because an
// invented "Tuesday" is exactly the fabrication class this floor exists for.
export const PROPER_NOUN_ALLOWLIST = new Set([
    "i", "i'm", "i'll", "i'd", "i've", "ok", "okay", "english",
]);

/**
 * Conservative fabrication floor for text that may only restate the
 * conversation: any DIGIT token or PROPER-NOUN token in it that appears
 * nowhere in the transcript is an invented specific ("validated it Tuesday",
 * a team name, a number the user never gave).
 *
 * Deliberately low-false-positive — the check runs against the FULL transcript
 * (all speakers), wider than the prompts' stricter per-speaker rules: a token
 * absent from the entire conversation is definitely fabricated, a token only
 * the other speaker said might be a legitimate re-say. Proper-noun detection
 * skips sentence-initial positions (sentence case is indistinguishable there).
 * Worst case of a miss is a fabricated detail surviving (the prompt's job);
 * worst case of a hit is a dropped insight/bullet — never a wrong card.
 *
 * Returns the first offending token, or null when the spans are grounded.
 */
export function findFabricatedToken(
    spans: string[],
    transcript: CaptureTranscriptLine[],
): string | null {
    if (spans.length === 0) return null;

    const haystack = transcript.map((l) => l.text).join("\n").toLowerCase();
    // Digit comparison ignores formatting ("5,000" vs "5000", "3pm" vs "3 PM").
    const digitHaystack = haystack.replace(/[^a-z0-9]/g, "");

    for (const span of spans) {
        const tokens = span.split(/\s+/).filter(Boolean);
        let sentenceInitial = true;
        for (const rawToken of tokens) {
            const token = rawToken.replace(/^[^\p{L}\p{N}'’$]+|[^\p{L}\p{N}'’%]+$/gu, "");
            const startsSentence = sentenceInitial;
            sentenceInitial = /[.!?]$/.test(rawToken);
            if (!token) continue;

            if (/\d/.test(token)) {
                const normalized = token.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (digitHaystack.includes(normalized)) continue;
                const asInt = Number.parseInt(normalized, 10);
                if (
                    String(asInt) === normalized &&
                    asInt >= 0 &&
                    asInt <= 12 &&
                    haystack.includes(SPELLED_INTEGERS[asInt])
                ) {
                    continue;
                }
                return token;
            }

            if (startsSentence) continue;
            if (!/^[A-Z][a-z'’]+$/.test(token)) continue;
            if (PROPER_NOUN_ALLOWLIST.has(token.toLowerCase())) continue;
            if (!haystack.includes(token.toLowerCase())) return token;
        }
    }
    return null;
}
