import "server-only";

import type { CaptureTranscriptLine } from "@/types/captures";

import { type ChannelEnergy, computeChannelEnergy } from "./audio";
import {
    ECHO_LEAK_RULE_VERSION,
    isEchoLeakUtterance,
    isPhoneticEchoOfOtherChannel,
} from "./echo-leak";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

// Channel silent across the whole capture → treat as dead and force all
// surviving utterances to the other side. Deepgram's own channel field is
// usually correct, but this is a belt-and-braces guard against a vendor
// hallucinating text on a silent channel.
const DEAD_CHANNEL_FLOOR_RMS = 0.001; // -60 dBFS

// Defensive safety net against ASR loop hallucinations. Rarely fires on
// Deepgram — kept as belt-and-braces.
const REPEATED_PHRASE_MIN_LENGTH = 20;
const REPEATED_PHRASE_MIN_COUNT = 3;

// Credentials + payment + government ID only. No redact=pii because it
// strips conversational content we need for coaching (names, locations,
// ages, occupations, etc.).
const REDACTION_ENTITIES: readonly string[] = [
    "credit_card",
    "credit_card_expiration",
    "cvv",
    "ssn",
    "bank_account",
    "routing_number",
    "passport_number",
    "password",
];

type DeepgramUtterance = {
    start: number;
    end: number;
    transcript: string;
    channel?: number;
    speaker?: number;
    confidence?: number;
};

type DeepgramResponse = {
    metadata?: { duration?: number };
    results?: {
        utterances?: DeepgramUtterance[];
    };
};

type TranscriptionResult = {
    serverTranscript: CaptureTranscriptLine[];
    durationSecs: number;
    echoLeakSuppressed: number;
    echoLeakDroppedSpans: { start: number; end: number }[];
    echoLeakRuleVersion: string;
};

/**
 * Transcribe a capture with Deepgram Nova-3 multichannel + diarization.
 *
 * Captures are stereo: left (c0) = user mic, right (c1) = system audio.
 * Deepgram decodes each channel independently, so user-vs-other identity
 * comes from the physical channel — no voice-embedding clustering or
 * timestamp heuristics needed.
 *
 * Within the right channel, Deepgram's diarization assigns integer speaker
 * IDs which we map to `other_1`, `other_2`, ... in first-seen order.
 */
export async function transcribeCapture(
    audioBuffer: Buffer,
): Promise<TranscriptionResult> {
    const energy: ChannelEnergy = await computeChannelEnergy(audioBuffer);
    const leftAlive = energy.maxLeftRms >= DEAD_CHANNEL_FLOOR_RMS;
    const rightAlive = energy.maxRightRms >= DEAD_CHANNEL_FLOOR_RMS;

    const dg = await transcribeStereoWithDeepgram(audioBuffer);

    const { lines, echoLeakSuppressed, echoLeakDroppedSpans } =
        mapUtterancesToLines(dg.utterances, energy, leftAlive, rightAlive);

    return {
        serverTranscript: lines,
        durationSecs: dg.durationSecs,
        echoLeakSuppressed,
        echoLeakDroppedSpans,
        echoLeakRuleVersion: ECHO_LEAK_RULE_VERSION,
    };
}

async function transcribeStereoWithDeepgram(
    stereoBuffer: Buffer,
): Promise<{ utterances: DeepgramUtterance[]; durationSecs: number }> {
    const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing DEEPGRAM_API_KEY");
    }

    const params = new URLSearchParams();
    params.set("model", "nova-3");
    params.set("language", "en");
    params.set("multichannel", "true");
    params.set("diarize", "true");
    params.set("utterances", "true");
    params.set("punctuate", "true");
    params.set("smart_format", "true");
    params.set("filler_words", "true");
    for (const entity of REDACTION_ENTITIES) {
        params.append("redact", entity);
    }

    const audioBlob = new Blob([new Uint8Array(stereoBuffer)], {
        type: "audio/ogg",
    });

    const res = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
        method: "POST",
        headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "audio/ogg",
        },
        body: audioBlob,
    });

    if (!res.ok) {
        const detail = await res.text();
        throw new Error(
            `Deepgram transcription failed (${res.status}): ${detail.slice(0, 500)}`,
        );
    }

    const body = (await res.json()) as DeepgramResponse;
    return {
        utterances: body.results?.utterances ?? [],
        durationSecs: body.metadata?.duration ?? 0,
    };
}

type OtherSpeakerState = {
    /** Map of Deepgram speaker id → stable `other_N` label, in first-seen order. */
    map: Map<number, string>;
    /** Last `other_N` label assigned to any utterance. Used as the fallback when Deepgram drops `speaker`. */
    lastLabel: string | null;
};

function mapUtterancesToLines(
    utterances: DeepgramUtterance[],
    energy: ChannelEnergy,
    leftAlive: boolean,
    rightAlive: boolean,
): {
    lines: CaptureTranscriptLine[];
    echoLeakSuppressed: number;
    echoLeakDroppedSpans: { start: number; end: number }[];
} {
    const repeated = detectRepeatedHallucinations(utterances);
    const otherSpeakerState: OtherSpeakerState = {
        map: new Map<number, string>(),
        lastLabel: null,
    };
    const kept: CaptureTranscriptLine[] = [];

    // Precomputed so overlap check is O(c1) per c0. Loud right-channel music
    // doesn't transcribe, so it produces no c1 utterance → overlap gate fails
    // → concurrent user speech is correctly preserved. Intentional.
    // Carries `text` for the phonetic detector; energy detector ignores it
    // (structural typing — accepts `{ start, end }` shape).
    const c1Windows = utterances
        .filter((u) => (u.channel ?? 0) === 1)
        .map((u) => ({
            start: u.start,
            end: u.end,
            text: (u.transcript ?? "").trim(),
        }));

    const droppedSpans: { start: number; end: number }[] = [];
    const droppedPreviews: string[] = [];

    for (const u of utterances) {
        const text = (u.transcript ?? "").trim();
        if (shouldDrop(text, repeated)) continue;

        // Echo suppression only runs when both channels are alive — the
        // dead-channel branch of tagSpeaker already handles one-sided cases.
        // Two detectors OR-composed: energy (loud residual + silence
        // hallucination) and phonetic (degraded-but-recognizable post-AEC
        // bleed). See lib/captures/echo-leak.ts header for rationale.
        // Missing Deepgram confidence defaults to 1.0 (fail-open — phonetic
        // detector's confidence gate then short-circuits → no drop).
        if (
            (u.channel ?? 0) === 0 &&
            leftAlive &&
            rightAlive &&
            (isEchoLeakUtterance(
                { start: u.start, end: u.end },
                energy,
                c1Windows,
            ) ||
                isPhoneticEchoOfOtherChannel(
                    {
                        start: u.start,
                        end: u.end,
                        text,
                        confidence: u.confidence ?? 1.0,
                    },
                    c1Windows,
                ))
        ) {
            droppedSpans.push({ start: u.start, end: u.end });
            if (droppedPreviews.length < 3) {
                droppedPreviews.push(text.slice(0, 60));
            }
            continue;
        }

        const speaker = tagSpeaker(
            u,
            leftAlive,
            rightAlive,
            otherSpeakerState,
        );

        kept.push({
            speaker,
            start: u.start,
            end: u.end,
            text,
        });
    }

    if (droppedSpans.length > 0) {
        console.info(
            `[captures/transcribe] Suppressed ${droppedSpans.length} channel-0 echo-leak utterance(s). Samples: ${JSON.stringify(droppedPreviews)}`,
        );
    }

    kept.sort((a, b) => a.start - b.start);
    return {
        lines: kept,
        echoLeakSuppressed: droppedSpans.length,
        echoLeakDroppedSpans: droppedSpans,
    };
}

function tagSpeaker(
    utterance: DeepgramUtterance,
    leftAlive: boolean,
    rightAlive: boolean,
    state: OtherSpeakerState,
): string {
    if (!leftAlive && rightAlive) {
        return resolveOtherSpeaker(utterance, state);
    }
    if (leftAlive && !rightAlive) return "user";
    if (!leftAlive && !rightAlive) return "user";

    if ((utterance.channel ?? 0) === 0) return "user";
    return resolveOtherSpeaker(utterance, state);
}

function resolveOtherSpeaker(
    utterance: DeepgramUtterance,
    state: OtherSpeakerState,
): string {
    const dgSpeakerId = utterance.speaker;
    if (typeof dgSpeakerId === "number") {
        const existing = state.map.get(dgSpeakerId);
        if (existing) {
            state.lastLabel = existing;
            return existing;
        }
        const nextIdx = state.map.size + 1;
        const label = `other_${nextIdx}`;
        state.map.set(dgSpeakerId, label);
        state.lastLabel = label;
        return label;
    }
    // Deepgram dropped the speaker field for this right-channel utterance
    // (rare — usually single-word fragments). Reuse the most-recent label
    // so the surrounding speaker context stays coherent; fall back to
    // `other_1` only if we haven't assigned any label yet.
    return state.lastLabel ?? "other_1";
}

function shouldDrop(text: string, repeated: Set<string>): boolean {
    if (!text) return true;
    if (repeated.has(normalizeForMatch(text))) return true;
    if (isShortKnownHallucination(text)) return true;
    return false;
}

function detectRepeatedHallucinations(
    utterances: DeepgramUtterance[],
): Set<string> {
    const counts = new Map<string, number>();
    for (const u of utterances) {
        const norm = normalizeForMatch(u.transcript ?? "");
        if (norm.length < REPEATED_PHRASE_MIN_LENGTH) continue;
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }
    const repeated = new Set<string>();
    for (const [phrase, count] of counts) {
        if (count >= REPEATED_PHRASE_MIN_COUNT) repeated.add(phrase);
    }
    return repeated;
}

function normalizeForMatch(text: string): string {
    return text
        .toLowerCase()
        .replace(/[.,!?;:"'()[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const SHORT_HALLUCINATION_PHRASES: ReadonlySet<string> = new Set([
    "thank you",
    "thanks",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "subscribe",
    "like and subscribe",
    "[music]",
    "(music)",
    "♪",
    "bye",
    "bye bye",
    "you",
]);

function isShortKnownHallucination(text: string): boolean {
    return SHORT_HALLUCINATION_PHRASES.has(normalizeForMatch(text));
}
