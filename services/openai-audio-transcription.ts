import "server-only";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts (e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). Do not rewrite, summarize, or correct grammar. Keep the original wording and pacing cues as text.";

/**
 * Plain-text transcription for short feedback clips (skip / reflection).
 * Server-only; uses the same model env as `/api/transcribe`.
 */
export async function transcribeAudioFileToPlainText(
    file: File,
): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing OPENAI_API_KEY.");
    }

    const upstream = new FormData();
    upstream.append(
        "model",
        process.env.TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIBE_MODEL,
    );
    upstream.append("file", file);
    upstream.append("prompt", VERBATIM_PROMPT);

    const res = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstream,
    });

    if (!res.ok) {
        const detail = await res.text();
        throw new Error(
            `Transcription failed (${res.status}): ${detail.slice(0, 500)}`,
        );
    }

    const body = (await res.json()) as { text?: string };
    return (body.text ?? "").trim();
}
