import "server-only";

import type { CaptureTranscriptLine } from "@/types/captures";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";

const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts " +
    "(e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). " +
    "Do not rewrite, summarize, or correct grammar.";

type TranscriptionResult = {
    serverTranscript: CaptureTranscriptLine[];
    durationSecs: number;
};

/**
 * Re-transcribe capture audio with Whisper for higher quality, then map
 * speaker labels from the desktop agent's transcript using timestamp overlap.
 *
 * Speaker identification is handled by the desktop agent (which has access
 * to the separate audio streams in real-time). We trust those labels and
 * just inherit them onto the higher-quality Whisper segments.
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

    const audioBlob = new Blob([new Uint8Array(audioBuffer)], {
        type: "audio/ogg",
    });
    const fd = new FormData();
    fd.append("model", model);
    fd.append("file", audioBlob, "audio.ogg");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "segment");
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
        text?: string;
        duration?: number;
        segments?: Array<{ start?: number; end?: number; text?: string }>;
    };

    const segments = body.segments ?? [];
    const durationSecs = body.duration ?? 0;

    const serverTranscript: CaptureTranscriptLine[] = segments
        .map((seg) => {
            const start = seg.start ?? 0;
            const end = seg.end ?? start;
            const text = (seg.text ?? "").trim();
            const speaker = matchSpeaker(start, end, agentTranscript);
            return { speaker, start, end, text };
        })
        .filter((line) => line.text.length > 0);

    return { serverTranscript, durationSecs };
}

/**
 * Find the agent transcript line with the greatest time overlap to inherit
 * its speaker label for the server transcript segment.
 */
function matchSpeaker(
    start: number,
    end: number,
    agentTranscript: CaptureTranscriptLine[],
): string {
    let bestOverlap = 0;
    let bestSpeaker = "user";

    for (const line of agentTranscript) {
        const overlapStart = Math.max(start, line.start);
        const overlapEnd = Math.min(end, line.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);

        if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestSpeaker = line.speaker;
        }
    }

    return bestSpeaker;
}
