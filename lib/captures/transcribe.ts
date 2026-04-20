import "server-only";

import type { CaptureTranscriptLine } from "@/types/captures";

import {
    type ChannelEnergy,
    computeChannelEnergy,
    extractMixedMonoOpusForWhisper,
    rmsInWindow,
} from "./audio";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";

// Whisper's `prompt` is a style/vocabulary bias, not an instruction.
// Anything instruction-shaped gets echoed verbatim during silent windows
// (we watched "Do not rewrite, summarize, or correct grammar." appear as
// transcript text at 0s/30s/60s). Seeding with disfluencies biases the
// decoder toward preserving them rather than tidying them up.
const VERBATIM_PROMPT = "Um, uh, yeah, hmm, well, like, you know, I mean.";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Channel is silent across the whole capture → treat it as dead. */
const DEAD_CHANNEL_FLOOR_RMS = 0.001; // -60 dBFS
/** OpenAI combined drop condition — both signals must fire together. */
const NO_SPEECH_PROB_DROP = 0.6;
const AVG_LOGPROB_DROP = -1.0;
/** Repetitive gibberish inside one segment. */
const COMPRESSION_RATIO_DROP = 2.4;
/** Cross-segment repetition — phrases this long repeated this many times
 *  are loop hallucinations (e.g. prompt echoes, "please subscribe"). */
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

type MonoTranscribeResult = {
    segments: WhisperSegment[];
    durationSecs: number;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Re-transcribe a capture with OpenAI Whisper, recovering speaker labels
 * from ground-truth per-channel audio.
 *
 * Why the full-mix approach:
 * Earlier we transcribed each channel separately so speaker identity
 * would be immediate (left-channel segments = user). Whisper performed
 * badly on those isolated mono tracks — it's a sequence model that
 * relies on full conversational context, and a channel with lots of
 * silence (one speaker waiting on the other) starves it. Whole
 * sentences got dropped; mono silences bred prompt-echo hallucinations.
 *
 * Instead we:
 *   1. Downmix the stereo capture to mono, highpass + loudness-normalize.
 *   2. Send one Whisper call — the model sees the conversation as it
 *      was actually spoken, with both turns audible, and transcribes
 *      dramatically more reliably.
 *   3. For each returned segment, measure left-channel RMS vs
 *      right-channel RMS during its [start, end] window, using the
 *      original stereo audio. Whichever side was louder is the speaker:
 *        left louder  → "user" (left = user mic, always)
 *        right louder → one of "other_*" (disambiguated by overlap
 *                       against agent `other_*` lines; agent timing is
 *                       only consulted for `other_1` vs `other_2` vs
 *                       `other_unmic`, never to decide user-vs-other)
 *
 * We never depend on agent timing for the user-vs-other distinction —
 * that's what broke the original overlap-based approach.
 *
 * Hallucination defenses (kept from the per-channel version):
 *   - `temperature=0` pinned (kills Whisper's creative retry loop).
 *   - Disfluency-style prompt (instruction-style prompts get echoed).
 *   - Cross-segment repetition detector.
 *   - OpenAI combined `no_speech_prob > 0.6 AND avg_logprob < -1.0`.
 *   - `compression_ratio > 2.4`.
 *   - Short canonical denylist (exact-match).
 */
export async function retranscribeCapture(
    audioBuffer: Buffer,
    agentTranscript: CaptureTranscriptLine[],
): Promise<TranscriptionResult> {
    // Channel energy is mandatory — we need it for speaker tagging. If
    // this fails the stage throws so retry logic can handle it.
    const energy: ChannelEnergy = await computeChannelEnergy(audioBuffer);

    const leftAlive = energy.maxLeftRms >= DEAD_CHANNEL_FLOOR_RMS;
    const rightAlive = energy.maxRightRms >= DEAD_CHANNEL_FLOOR_RMS;

    console.log("[captures/transcribe] channel energy", {
        maxLeftRms: energy.maxLeftRms,
        maxRightRms: energy.maxRightRms,
        leftAlive,
        rightAlive,
    });

    if (!leftAlive) {
        console.warn(
            "[captures/transcribe] left (user) channel silent across whole capture — all segments will default to other_*",
        );
    }
    if (!rightAlive) {
        console.warn(
            "[captures/transcribe] right (system audio) channel silent across whole capture — all segments will default to user",
        );
    }

    const mixedBuffer = await extractMixedMonoOpusForWhisper(audioBuffer);
    const whisper = await transcribeMono(mixedBuffer);

    const serverTranscript = filterAndTagSegments(
        whisper.segments,
        energy,
        leftAlive,
        rightAlive,
        agentTranscript,
    );

    return {
        serverTranscript,
        durationSecs: whisper.durationSecs,
    };
}

// ---------------------------------------------------------------------------
// Whisper call
// ---------------------------------------------------------------------------

async function transcribeMono(
    monoOggBuffer: Buffer,
): Promise<MonoTranscribeResult> {
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
// Filter + speaker tagging
// ---------------------------------------------------------------------------

function filterAndTagSegments(
    segments: WhisperSegment[],
    energy: ChannelEnergy,
    leftAlive: boolean,
    rightAlive: boolean,
    agentTranscript: CaptureTranscriptLine[],
): CaptureTranscriptLine[] {
    const repeated = detectRepeatedHallucinations(segments);

    // Diagnostic: dump every Whisper segment with its quality signals AND
    // per-channel RMS so we can see what the speaker-tagging decision is
    // based on. Essential while this pipeline is new.
    console.log(
        `[captures/transcribe] raw Whisper segments (${segments.length})`,
        segments.slice(0, 80).map((s) => {
            const { left, right } = rmsInWindow(energy, s.start, s.end);
            return {
                start: Number(s.start.toFixed(2)),
                end: Number(s.end.toFixed(2)),
                text: s.text,
                noSpeechProb: Number(s.noSpeechProb.toFixed(3)),
                avgLogprob: Number(s.avgLogprob.toFixed(3)),
                compressionRatio: Number(s.compressionRatio.toFixed(2)),
                leftRms: Number(left.toFixed(4)),
                rightRms: Number(right.toFixed(4)),
            };
        }),
    );
    if (repeated.size > 0) {
        console.log(
            "[captures/transcribe] repeated-loop phrases",
            Array.from(repeated),
        );
    }

    const kept: CaptureTranscriptLine[] = [];
    const dropReasons = new Map<string, number>();
    const dropSamples = new Map<string, string[]>();
    let userCount = 0;
    let otherCount = 0;

    for (const seg of segments) {
        const reason = dropReason(seg, repeated);
        if (reason) {
            dropReasons.set(reason, (dropReasons.get(reason) ?? 0) + 1);
            const samples = dropSamples.get(reason) ?? [];
            if (samples.length < 3) {
                samples.push(`"${seg.text}"`);
                dropSamples.set(reason, samples);
            }
            continue;
        }

        const speaker = tagSpeaker(
            seg,
            energy,
            leftAlive,
            rightAlive,
            agentTranscript,
        );
        if (speaker === "user") userCount++;
        else otherCount++;

        kept.push({
            speaker,
            start: seg.start,
            end: seg.end,
            text: seg.text,
        });
    }

    kept.sort((a, b) => a.start - b.start);

    console.log("[captures/transcribe] segment counts", {
        whisperReturned: segments.length,
        kept: kept.length,
        userKept: userCount,
        otherKept: otherCount,
    });

    if (dropReasons.size > 0) {
        const breakdown: Record<string, { count: number; samples: string[] }> =
            {};
        for (const [reason, count] of dropReasons) {
            breakdown[reason] = {
                count,
                samples: dropSamples.get(reason) ?? [],
            };
        }
        console.log("[captures/transcribe] drop breakdown", breakdown);
    }

    return kept;
}

function tagSpeaker(
    seg: WhisperSegment,
    energy: ChannelEnergy,
    leftAlive: boolean,
    rightAlive: boolean,
    agentTranscript: CaptureTranscriptLine[],
): string {
    // Dead-channel shortcuts — if one side never had signal, every
    // surviving segment belongs to the other side.
    if (!leftAlive && rightAlive) {
        return disambiguateOther(seg.start, seg.end, agentTranscript);
    }
    if (leftAlive && !rightAlive) return "user";

    const { left, right } = rmsInWindow(energy, seg.start, seg.end);
    return left > right
        ? "user"
        : disambiguateOther(seg.start, seg.end, agentTranscript);
}

function dropReason(
    seg: WhisperSegment,
    repeated: Set<string>,
): string | null {
    if (!seg.text) return "empty";
    if (repeated.has(normalizeForMatch(seg.text))) return "repeated-loop";
    if (
        seg.noSpeechProb > NO_SPEECH_PROB_DROP &&
        seg.avgLogprob < AVG_LOGPROB_DROP
    ) {
        return "no-speech+low-logprob";
    }
    if (seg.compressionRatio > COMPRESSION_RATIO_DROP) {
        return "compression-ratio";
    }
    if (isShortKnownHallucination(seg.text)) return "short-denylist";
    return null;
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
// other_* disambiguation — overlap against agent's other_* lines only
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
