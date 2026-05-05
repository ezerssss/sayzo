import "server-only";

import type { CaptureTranscriptLine } from "@/types/captures";

import { type ChannelEnergy, computeChannelEnergy } from "./audio";
import {
    ECHO_LEAK_RULE_VERSION,
    isEchoLeakUtterance,
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
 * Re-transcribe a capture with Deepgram Nova-3 multichannel + diarization.
 *
 * Captures are stereo: left (c0) = user mic, right (c1) = system audio.
 * Deepgram decodes each channel independently, so user-vs-other identity
 * comes from the physical channel — no voice-embedding clustering or
 * timestamp heuristics needed.
 *
 * Within the right channel, Deepgram's diarization assigns integer speaker
 * IDs which we map to `other_1`, `other_2`, ... in first-seen order.
 */
export async function retranscribeCapture(
    audioBuffer: Buffer,
    agentTranscript: CaptureTranscriptLine[],
): Promise<TranscriptionResult> {
    const energy: ChannelEnergy = await computeChannelEnergy(audioBuffer);
    const leftAlive = energy.maxLeftRms >= DEAD_CHANNEL_FLOOR_RMS;
    const rightAlive = energy.maxRightRms >= DEAD_CHANNEL_FLOOR_RMS;

    const dg = await transcribeStereoWithDeepgram(audioBuffer);

    const { lines, echoLeakSuppressed, echoLeakDroppedSpans } =
        mapUtterancesToLines(
            dg.utterances,
            energy,
            leftAlive,
            rightAlive,
            agentTranscript,
        );

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

function mapUtterancesToLines(
    utterances: DeepgramUtterance[],
    energy: ChannelEnergy,
    leftAlive: boolean,
    rightAlive: boolean,
    agentTranscript: CaptureTranscriptLine[],
): {
    lines: CaptureTranscriptLine[];
    echoLeakSuppressed: number;
    echoLeakDroppedSpans: { start: number; end: number }[];
} {
    const repeated = detectRepeatedHallucinations(utterances);
    const otherSpeakerMap = new Map<number, string>();
    const kept: CaptureTranscriptLine[] = [];

    // Precomputed so overlap check is O(c1) per c0. Loud right-channel music
    // doesn't transcribe, so it produces no c1 utterance → overlap gate fails
    // → concurrent user speech is correctly preserved. Intentional.
    const c1Intervals = utterances
        .filter((u) => (u.channel ?? 0) === 1)
        .map((u) => ({ start: u.start, end: u.end }));

    const droppedSpans: { start: number; end: number }[] = [];
    const droppedPreviews: string[] = [];

    for (const u of utterances) {
        const text = (u.transcript ?? "").trim();
        if (shouldDrop(text, repeated)) continue;

        // Echo suppression only runs when both channels are alive — the
        // dead-channel branch of tagSpeaker already handles one-sided cases.
        if (
            (u.channel ?? 0) === 0 &&
            leftAlive &&
            rightAlive &&
            isEchoLeakUtterance(
                { start: u.start, end: u.end },
                energy,
                c1Intervals,
            )
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
            otherSpeakerMap,
            agentTranscript,
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
    otherSpeakerMap: Map<number, string>,
    agentTranscript: CaptureTranscriptLine[],
): string {
    if (!leftAlive && rightAlive) {
        return resolveOtherSpeaker(
            utterance,
            otherSpeakerMap,
            agentTranscript,
        );
    }
    if (leftAlive && !rightAlive) return "user";
    if (!leftAlive && !rightAlive) return "user";

    if ((utterance.channel ?? 0) === 0) return "user";
    return resolveOtherSpeaker(utterance, otherSpeakerMap, agentTranscript);
}

function resolveOtherSpeaker(
    utterance: DeepgramUtterance,
    otherSpeakerMap: Map<number, string>,
    agentTranscript: CaptureTranscriptLine[],
): string {
    const dgSpeakerId = utterance.speaker;
    if (typeof dgSpeakerId === "number") {
        const existing = otherSpeakerMap.get(dgSpeakerId);
        if (existing) return existing;
        const nextIdx = otherSpeakerMap.size + 1;
        const label = `other_${nextIdx}`;
        otherSpeakerMap.set(dgSpeakerId, label);
        return label;
    }
    return disambiguateOtherByOverlap(
        utterance.start,
        utterance.end,
        agentTranscript,
    );
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

function disambiguateOtherByOverlap(
    start: number,
    end: number,
    agentTranscript: CaptureTranscriptLine[],
): string {
    let bestOverlap = 0;
    let bestSpeaker = "other_1";
    for (const line of agentTranscript) {
        if (!line.speaker.startsWith("other_")) continue;
        const overlap = Math.max(
            0,
            Math.min(end, line.end) - Math.max(start, line.start),
        );
        if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestSpeaker = line.speaker;
        }
    }
    return bestSpeaker;
}
