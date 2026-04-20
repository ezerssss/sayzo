import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import {
    assertHasCredit,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminStorageBucket } from "@/lib/firebase/admin";

const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";
const MAX_INPUT_CHARS = 2000;

type TtsRequestBody = {
    text?: unknown;
};

function cacheKey(text: string, model: string, voice: string): string {
    return createHash("sha256")
        .update(`${model}|${voice}|${text}`)
        .digest("hex");
}

export async function POST(request: NextRequest) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "Missing OPENAI_API_KEY. Add it in .env.local." },
            { status: 500 },
        );
    }

    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let body: TtsRequestBody;
    try {
        body = (await request.json()) as TtsRequestBody;
    } catch {
        return NextResponse.json(
            { error: "Expected JSON body." },
            { status: 400 },
        );
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
        return NextResponse.json({ error: "Missing text." }, { status: 400 });
    }
    if (text.length > MAX_INPUT_CHARS) {
        return NextResponse.json(
            { error: `Text exceeds ${MAX_INPUT_CHARS} characters.` },
            { status: 400 },
        );
    }

    try {
        await assertHasCredit(uid);
    } catch (err) {
        if (err instanceof CreditLimitReachedError) {
            return creditLimitResponse();
        }
        throw err;
    }

    const model = process.env.TTS_MODEL?.trim() || DEFAULT_TTS_MODEL;
    const voice = process.env.TTS_VOICE?.trim() || DEFAULT_TTS_VOICE;
    const hash = cacheKey(text, model, voice);
    const objectPath = `tts-cache/${hash}.mp3`;
    const bucket = getAdminStorageBucket();
    const cacheFile = bucket.file(objectPath);

    const [cacheHit] = await cacheFile.exists();
    if (cacheHit) {
        const [cached] = await cacheFile.download();
        const ab = new ArrayBuffer(cached.byteLength);
        new Uint8Array(ab).set(cached);
        return new Response(ab, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "no-store",
            },
        });
    }

    const upstream = await fetch(OPENAI_SPEECH_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            voice,
            input: text,
            response_format: "mp3",
        }),
    });

    if (!upstream.ok) {
        const detail = await upstream.text();
        return NextResponse.json(
            { error: "Speech synthesis failed.", detail },
            { status: upstream.status },
        );
    }

    const audioArrayBuffer = await upstream.arrayBuffer();

    // Fire-and-forget cache write — don't delay the response on upload.
    // A failed write just means the next request misses and regenerates.
    void cacheFile
        .save(Buffer.from(audioArrayBuffer), {
            resumable: false,
            contentType: "audio/mpeg",
        })
        .catch((err: unknown) => {
            console.warn("[api/tts] Failed to cache audio", err);
        });

    return new Response(audioArrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
        },
    });
}
