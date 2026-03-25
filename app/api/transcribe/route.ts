import { type NextRequest, NextResponse } from "next/server";

const OPENAI_TRANSCRIPTIONS_URL =
    "https://api.openai.com/v1/audio/transcriptions";

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
const VERBATIM_PROMPT =
    "Transcribe verbatim. Preserve disfluencies and speech artifacts (e.g., 'uh', 'um', 'ah', stutters, false starts, repetitions). Do not rewrite, summarize, or correct grammar. Keep the original wording and pacing cues as text.";

export async function POST(request: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            {
                error: "Missing OPENAI_API_KEY. Add it in .env.local.",
            },
            { status: 500 },
        );
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Expected multipart form data." },
            { status: 400 },
        );
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json(
            { error: "Missing or empty audio file." },
            { status: 400 },
        );
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
        return NextResponse.json(
            { error: "Transcription failed.", detail },
            { status: res.status },
        );
    }

    const body = (await res.json()) as { text?: string };
    return NextResponse.json({ text: body.text ?? "" });
}
