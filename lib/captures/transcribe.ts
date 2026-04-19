import "server-only";

import type { CaptureTranscriptLine } from "@/types/captures";

import {
    type ChannelEnergy,
    computeChannelEnergy,
    extractChannelAsMonoOpus,
    rmsOverWindow,
} from "./audio";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";

const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts " +
    "(e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). " +
    "Do not rewrite, summarize, or correct grammar.";

// ---------------------------------------------------------------------------
// Hallucination-filter thresholds
// ---------------------------------------------------------------------------

/** Whisper's own confidence the segment is non-speech. OpenAI's recommended drop threshold. */
const NO_SPEECH_PROB_DROP = 0.6;
/** Log-probability below which the segment was a low-confidence transcription. */
const AVG_LOGPROB_DROP = -1.0;
/** Repetitive gibberish ("thank you thank you thank you…") has very high text compression. */
const COMPRESSION_RATIO_DROP = 2.4;
/** If the segment's own channel is this quiet, Whisper is transcribing silence. */
const CHANNEL_SILENCE_FLOOR_RMS = 0.01; // 1% full-scale
/** If the entire channel is below this for the whole capture, skip the Whisper call. */
const DEAD_CHANNEL_FLOOR_RMS = 0.005; // 0.5% full-scale
/** Soft quality thresholds — paired with the phrase denylist to avoid false positives. */
const PHRASE_NO_SPEECH_SOFT = 0.3;
const PHRASE_LOGPROB_SOFT = -0.5;

/**
 * Phrases Whisper famously hallucinates on silence. Matched by equality
 * against the normalized segment text (lowercased, punctuation-stripped,
 * whitespace-collapsed) — NOT substring — so a user genuinely saying
 * "I want to thank you for this" isn't dropped. Combined with a soft
 * quality-signal check as a second gate.
 */
const HALLUCINATION_PHRASES: readonly string[] = [
    "thank you",
    "thank you very much",
    "thanks",
    "thanks for watching",
    "thank you for watching",
    "please subscribe",
    "like and subscribe",
    "subscribe",
    "subscribe to the channel",
    "see you in the next video",
    "see you next time",
    "[music]",
    "(music)",
    "♪",
    "subtitles by the amara.org community",
    "subtitles by",
    "subtitled by",
    "transcribed by",
    "bye",
    "bye bye",
    "you",
];

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

const DEBUG_SPEAKER =
    process.env.DEBUG?.includes("sayzo:speaker") ?? false;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Re-transcribe capture audio per-channel: run Whisper separately on the
 * user mic (left) and system audio (right) so each channel has ground-truth
 * speaker identity. Filters Whisper hallucinations (common on near-silent
 * channels) via a 6-rule defense stack, disambiguates `other_*` labels by
 * overlap against the agent transcript, and merges both sides by timestamp.
 */
export async function retranscribeCapture(
    audioBuffer: Buffer,
    agentTranscript: CaptureTranscriptLine[],
): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY");
    }
    const model =
        process.env.CAPTURE_TRANSCRIBE_MODEL?.trim() || "whisper-1";

    // Per-channel energy envelope feeds the channel-silence hallucination
    // check and the dead-channel guard. If this fails we continue without
    // it — quality-signal drops and the phrase denylist still work.
    let energy: ChannelEnergy | null = null;
    try {
        energy = await computeChannelEnergy(audioBuffer);
    } catch (err) {
        console.warn(
            "[captures/transcribe] channel-energy computation failed, continuing without channel-silence filter:",
            err,
        );
    }

    const leftAlive =
        !energy || energy.maxLeftRms >= DEAD_CHANNEL_FLOOR_RMS;
    const rightAlive =
        !energy || energy.maxRightRms >= DEAD_CHANNEL_FLOOR_RMS;
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

    // Extract each channel as mono OGG Opus and Whisper-transcribe in
    // parallel. If either Whisper call fails, the whole stage throws and
    // gets marked transcribe_failed by the caller's retry logic.
    const emptyResult = { segments: [] as WhisperSegment[], durationSecs: 0 };
    const [leftResult, rightResult] = await Promise.all([
        leftAlive
            ? extractChannelAsMonoOpus(audioBuffer, "left").then((buf) =>
                  transcribeMono(buf, apiKey, model),
              )
            : Promise.resolve(emptyResult),
        rightAlive
            ? extractChannelAsMonoOpus(audioBuffer, "right").then((buf) =>
                  transcribeMono(buf, apiKey, model),
              )
            : Promise.resolve(emptyResult),
    ]);

    const durationSecs = Math.max(
        leftResult.durationSecs,
        rightResult.durationSecs,
    );

    const userLines: CaptureTranscriptLine[] = [];
    for (const seg of leftResult.segments) {
        const drop = shouldDropHallucination(seg, "user", energy);
        if (DEBUG_SPEAKER) logSegment("user", seg, drop);
        if (drop.drop) continue;
        userLines.push({
            speaker: "user",
            start: seg.start,
            end: seg.end,
            text: seg.text,
        });
    }

    const otherLines: CaptureTranscriptLine[] = [];
    for (const seg of rightResult.segments) {
        const drop = shouldDropHallucination(seg, "other", energy);
        if (DEBUG_SPEAKER) logSegment("other", seg, drop);
        if (drop.drop) continue;
        otherLines.push({
            speaker: disambiguateOther(seg.start, seg.end, agentTranscript),
            start: seg.start,
            end: seg.end,
            text: seg.text,
        });
    }

    const serverTranscript = [...userLines, ...otherLines].sort(
        (a, b) => a.start - b.start,
    );

    return { serverTranscript, durationSecs };
}

// ---------------------------------------------------------------------------
// Whisper call
// ---------------------------------------------------------------------------

async function transcribeMono(
    monoOggBuffer: Buffer,
    apiKey: string,
    model: string,
): Promise<{ segments: WhisperSegment[]; durationSecs: number }> {
    const blob = new Blob([new Uint8Array(monoOggBuffer)], {
        type: "audio/ogg",
    });
    const fd = new FormData();
    fd.append("model", model);
    fd.append("file", blob, "audio.ogg");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "segment");
    // Pin temperature to 0 to disable Whisper's retry-with-higher-temperature
    // loop, which is a major source of hallucinated text on silent stretches.
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
// Hallucination filter
// ---------------------------------------------------------------------------

type DropDecision = { drop: boolean; reason: string };

function shouldDropHallucination(
    seg: WhisperSegment,
    channel: "user" | "other",
    energy: ChannelEnergy | null,
): DropDecision {
    if (!seg.text) return { drop: true, reason: "empty_text" };

    if (seg.noSpeechProb > NO_SPEECH_PROB_DROP) {
        return { drop: true, reason: "no_speech_prob" };
    }
    if (seg.avgLogprob < AVG_LOGPROB_DROP) {
        return { drop: true, reason: "avg_logprob" };
    }
    if (seg.compressionRatio > COMPRESSION_RATIO_DROP) {
        return { drop: true, reason: "compression_ratio" };
    }

    if (energy) {
        const { left, right } = rmsOverWindow(energy, seg.start, seg.end);
        const chRms = channel === "user" ? left : right;
        if (chRms < CHANNEL_SILENCE_FLOOR_RMS) {
            return { drop: true, reason: "channel_silent" };
        }
    }

    if (
        isHallucinationPhrase(seg.text) &&
        (seg.noSpeechProb > PHRASE_NO_SPEECH_SOFT ||
            seg.avgLogprob < PHRASE_LOGPROB_SOFT)
    ) {
        return { drop: true, reason: "phrase_denylist" };
    }

    return { drop: false, reason: "kept" };
}

function isHallucinationPhrase(text: string): boolean {
    const n = text
        .toLowerCase()
        .replace(/[.,!?;:"']/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return HALLUCINATION_PHRASES.includes(n);
}

// ---------------------------------------------------------------------------
// other_* label disambiguation
// ---------------------------------------------------------------------------

/**
 * Assign an `other_*` label to a right-channel Whisper segment by finding
 * the agent transcript line with the greatest timestamp overlap, restricted
 * to `other_*` agent lines only. This is the sub-problem overlap matching
 * is actually good at — the agent distinguishes other_1 vs other_2 from
 * prosody/VAD clustering, and the channel signal has already confirmed
 * "not user" for us. Falls back to `other_1` if no agent `other_*` line
 * overlaps (e.g. agent didn't tag anything here).
 */
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

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

function logSegment(
    channel: "user" | "other",
    seg: WhisperSegment,
    decision: DropDecision,
): void {
    console.log("[sayzo:speaker]", {
        channel,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        noSpeechProb: seg.noSpeechProb,
        avgLogprob: seg.avgLogprob,
        compressionRatio: seg.compressionRatio,
        kept: !decision.drop,
        reason: decision.reason,
    });
}
