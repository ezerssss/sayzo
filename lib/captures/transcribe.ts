import "server-only";

import type { CaptureTranscriptLine } from "@/types/captures";

import {
    type ChannelEnergy,
    computeChannelEnergy,
    extractChannelAsMonoOpusForWhisper,
} from "./audio";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";

const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts " +
    "(e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). " +
    "Do not rewrite, summarize, or correct grammar.";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Channel is silent across the whole capture → skip Whisper entirely for it. */
const DEAD_CHANNEL_FLOOR_RMS = 0.001; // 0.1% full-scale, -60 dBFS
/** OpenAI combined drop condition — both signals must fire together. */
const NO_SPEECH_PROB_DROP = 0.6;
const AVG_LOGPROB_DROP = -1.0;
/** Repetitive-gibberish mode — real speech never compresses this hard. */
const COMPRESSION_RATIO_DROP = 2.4;
/** Cross-segment repetition detector — phrases this long and repeated this many times on the same channel are loop hallucinations. */
const REPEATED_PHRASE_MIN_LENGTH = 20;
const REPEATED_PHRASE_MIN_COUNT = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WhisperSegment = {
    start: number;
    end: number;
    text: string;
    avgLogprob: number;
    compressionRatio: number;
    noSpeechProb: number;
};

type TranscriptionResult = {
    serverTranscript: CaptureTranscriptLine[];
    durationSecs: number;
};

type ChannelTranscribeResult = {
    segments: WhisperSegment[];
    durationSecs: number;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Per-channel Whisper transcription with loudness normalization.
 *
 * Left channel = user mic (hardcoded convention), right = system audio.
 * Each channel is isolated as mono, loudness-normalized (so quiet mics
 * don't starve Whisper into hallucinating subtitle-style filler), and
 * Whisper'd independently. Left-channel segments become `user` lines;
 * right-channel segments get disambiguated into `other_1`/`other_2`/etc
 * by overlap against the agent's `other_*` lines (the only place where
 * the possibly-unsynced agent timestamps are used — and even then just
 * for labeling among `other_*`, not for the user-vs-other distinction
 * which is already ground truth from the channel).
 *
 * Defenses against Whisper silence hallucinations:
 * - Loudness normalization before Whisper (upstream fix — better signal
 *   → fewer hallucinations)
 * - `temperature=0` pinned on Whisper (kills the retry-with-higher-temp
 *   creative loop)
 * - Cross-segment repetition detector per channel (catches loop
 *   hallucinations like "if you have any questions, please post them in
 *   the comments section below" repeating everywhere)
 * - OpenAI's combined quality-signal drop (`no_speech_prob > 0.6` AND
 *   `avg_logprob < -1.0`)
 * - `compression_ratio > 2.4` (repetitive gibberish)
 * - Short-phrase denylist (`"thank you"`, `"[music]"`, etc. when the
 *   whole segment IS the phrase)
 * - Dead-channel guard — skip Whisper for a channel that's silent the
 *   whole capture
 *
 * On any Whisper failure the whole stage throws, and the caller's retry
 * logic marks the capture `transcribe_failed`.
 */
export async function retranscribeCapture(
    audioBuffer: Buffer,
    agentTranscript: CaptureTranscriptLine[],
): Promise<TranscriptionResult> {
    // Detect dead channels (system-audio tap failed, mic unplugged) so we
    // don't spend Whisper dollars on silence. Fall back to running both
    // channels if the energy check itself fails — we'd rather spend the
    // extra Whisper call than silently drop a side.
    let energy: ChannelEnergy | null = null;
    try {
        energy = await computeChannelEnergy(audioBuffer);
    } catch (err) {
        console.warn(
            "[captures/transcribe] channel-energy check failed, running Whisper on both channels anyway:",
            err,
        );
    }

    const leftAlive =
        !energy || energy.maxLeftRms >= DEAD_CHANNEL_FLOOR_RMS;
    const rightAlive =
        !energy || energy.maxRightRms >= DEAD_CHANNEL_FLOOR_RMS;

    console.log("[captures/transcribe] channel energy", {
        maxLeftRms: energy?.maxLeftRms,
        maxRightRms: energy?.maxRightRms,
        leftAlive,
        rightAlive,
    });

    if (energy && !leftAlive) {
        console.warn(
            "[captures/transcribe] left (user) channel silent across whole capture — skipping user transcription",
        );
    }
    if (energy && !rightAlive) {
        console.warn(
            "[captures/transcribe] right (system audio) channel silent across whole capture — skipping other transcription",
        );
    }

    const empty: ChannelTranscribeResult = {
        segments: [],
        durationSecs: 0,
    };
    const [leftResult, rightResult] = await Promise.all([
        leftAlive ? transcribeChannel(audioBuffer, "left") : Promise.resolve(empty),
        rightAlive ? transcribeChannel(audioBuffer, "right") : Promise.resolve(empty),
    ]);

    const durationSecs = Math.max(
        leftResult.durationSecs,
        rightResult.durationSecs,
    );

    // Filter each channel independently. Cross-segment repetition is
    // per-channel so a hallucination that loops through the user's side
    // doesn't get masked by legitimate backchannels on the other side.
    const userLines = filterAndTagChannel(
        leftResult.segments,
        "user",
        agentTranscript,
    );
    const otherLines = filterAndTagChannel(
        rightResult.segments,
        "other",
        agentTranscript,
    );

    console.log("[captures/transcribe] segment counts", {
        leftWhisper: leftResult.segments.length,
        rightWhisper: rightResult.segments.length,
        userKept: userLines.length,
        otherKept: otherLines.length,
    });

    const serverTranscript = [...userLines, ...otherLines].sort(
        (a, b) => a.start - b.start,
    );

    return { serverTranscript, durationSecs };
}

// ---------------------------------------------------------------------------
// Per-channel Whisper call
// ---------------------------------------------------------------------------

async function transcribeChannel(
    audioBuffer: Buffer,
    channel: "left" | "right",
): Promise<ChannelTranscribeResult> {
    const monoOpusBuffer = await extractChannelAsMonoOpusForWhisper(
        audioBuffer,
        channel,
    );
    return transcribeMono(monoOpusBuffer);
}

async function transcribeMono(
    monoOggBuffer: Buffer,
): Promise<ChannelTranscribeResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY");
    }
    const model =
        process.env.CAPTURE_TRANSCRIBE_MODEL?.trim() || "whisper-1";

    const blob = new Blob([new Uint8Array(monoOggBuffer)], {
        type: "audio/ogg",
    });
    const fd = new FormData();
    fd.append("model", model);
    fd.append("file", blob, "audio.ogg");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "segment");
    // Pin temperature to 0 — Whisper's temperature-fallback retry loop is
    // the biggest creative-hallucination source on quiet audio.
    fd.append("temperature", "0");
    fd.append("prompt", VERBATIM_PROMPT);

    const res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
    });

    if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Transcription failed (${res.status}): ${detail}`);
    }

    const body = (await res.json()) as {
        duration?: number;
        segments?: Array<{
            start?: number;
            end?: number;
            text?: string;
            avg_logprob?: number;
            compression_ratio?: number;
            no_speech_prob?: number;
        }>;
    };

    const segments: WhisperSegment[] = (body.segments ?? []).map((seg) => {
        const start = seg.start ?? 0;
        return {
            start,
            end: seg.end ?? start,
            text: (seg.text ?? "").trim(),
            avgLogprob: seg.avg_logprob ?? 0,
            compressionRatio: seg.compression_ratio ?? 0,
            noSpeechProb: seg.no_speech_prob ?? 0,
        };
    });

    return { segments, durationSecs: body.duration ?? 0 };
}

// ---------------------------------------------------------------------------
// Filter + tag
// ---------------------------------------------------------------------------

function filterAndTagChannel(
    segments: WhisperSegment[],
    channel: "user" | "other",
    agentTranscript: CaptureTranscriptLine[],
): CaptureTranscriptLine[] {
    const repeated = detectRepeatedHallucinations(segments);

    const kept: CaptureTranscriptLine[] = [];
    let dropped = 0;
    const dropSample: string[] = [];

    for (const seg of segments) {
        const drop = shouldDropSegment(seg, repeated);
        if (drop) {
            dropped++;
            if (dropSample.length < 5) dropSample.push(`"${seg.text}"`);
            continue;
        }
        const speaker =
            channel === "user"
                ? "user"
                : disambiguateOther(seg.start, seg.end, agentTranscript);
        kept.push({
            speaker,
            start: seg.start,
            end: seg.end,
            text: seg.text,
        });
    }

    if (dropped > 0) {
        console.log(`[captures/transcribe] dropped ${dropped} ${channel} segments`, {
            examples: dropSample,
        });
    }

    return kept;
}

function shouldDropSegment(
    seg: WhisperSegment,
    repeated: Set<string>,
): boolean {
    if (!seg.text) return true;

    // Cross-segment repetition — catches "if you have any questions…"
    // looping across the whole channel.
    if (repeated.has(normalizeForMatch(seg.text))) return true;

    // OpenAI combined drop condition — AND, not OR. Mono audio tends to
    // have elevated no_speech_prob even on real speech, so a single
    // signal alone isn't enough.
    if (
        seg.noSpeechProb > NO_SPEECH_PROB_DROP &&
        seg.avgLogprob < AVG_LOGPROB_DROP
    ) {
        return true;
    }

    // Repetitive gibberish within a single segment.
    if (seg.compressionRatio > COMPRESSION_RATIO_DROP) return true;

    // Short canonical hallucinations — exact match only so "I want to
    // thank you for this" isn't dropped.
    if (isShortKnownHallucination(seg.text)) return true;

    return false;
}

// ---------------------------------------------------------------------------
// Cross-segment repetition
// ---------------------------------------------------------------------------

function detectRepeatedHallucinations(
    segments: WhisperSegment[],
): Set<string> {
    const counts = new Map<string, number>();
    for (const seg of segments) {
        const norm = normalizeForMatch(seg.text);
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

// ---------------------------------------------------------------------------
// Short known-hallucination denylist (exact-match only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// other_* disambiguation — overlap match against agent's other_* lines only
// ---------------------------------------------------------------------------

function disambiguateOther(
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
