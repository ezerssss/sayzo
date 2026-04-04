import { type NextRequest, NextResponse } from "next/server";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

export async function POST(request: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "Missing OPENAI_API_KEY." },
            { status: 500 },
        );
    }

    let body: { text?: string; voice?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Expected JSON body with text field." },
            { status: 400 },
        );
    }

    const text = body.text?.trim();
    if (!text) {
        return NextResponse.json(
            { error: "Missing text field." },
            { status: 400 },
        );
    }

    const voice = body.voice || "nova";

    const response = await fetch(OPENAI_SPEECH_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "tts-1",
            input: text,
            voice,
            response_format: "mp3",
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[api/tts] OpenAI TTS error:", errorText);
        return NextResponse.json(
            { error: "Text-to-speech generation failed." },
            { status: 502 },
        );
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(audioBuffer.byteLength),
        },
    });
}
