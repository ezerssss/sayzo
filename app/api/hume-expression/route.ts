import { measureSessionExpression } from "@/services/hume-expression";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Expected multipart form data." },
            { status: 400 },
        );
    }

    const audio = formData.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json(
            { error: "Missing or empty audio file." },
            { status: 400 },
        );
    }

    const transcriptRaw = formData.get("transcript");
    const transcript =
        typeof transcriptRaw === "string" ? transcriptRaw.trim() : "";
    if (!transcript) {
        return NextResponse.json(
            { error: "Missing or empty transcript." },
            { status: 400 },
        );
    }

    const buf = Buffer.from(await audio.arrayBuffer());

    try {
        const trimmed = await measureSessionExpression({
            audio: new Uint8Array(buf),
            filename: audio.name || "session.webm",
            contentType: audio.type || "application/octet-stream",
            transcript,
        });
        return NextResponse.json({
            trimmed,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Hume measurement failed.";
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
