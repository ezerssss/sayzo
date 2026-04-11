import { verifyAccessToken } from "@/lib/auth/jwt";
import {
    IngestError,
    ingestCapture,
    parseAndValidateRecord,
} from "@/lib/captures/ingest";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

// 50 MB audio + small JSON record + multipart boundaries — anything above this
// is rejected before we buffer the body into memory.
const MAX_REQUEST_BYTES = 55 * 1024 * 1024;

export async function POST(request: NextRequest) {
    // 1. Authenticate — extract UID from JWT
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";

    if (!token) {
        return NextResponse.json(
            { error: "unauthorized", message: "Missing authorization token" },
            { status: 401 },
        );
    }

    let uid: string;
    try {
        const payload = await verifyAccessToken(token);
        uid = payload.sub;
    } catch {
        return NextResponse.json(
            { error: "unauthorized", message: "Invalid or expired token" },
            { status: 401 },
        );
    }

    // 2. Cheap pre-check: reject oversized requests before buffering them.
    // The Content-Length header is a client-supplied hint, but it's enough to
    // short-circuit honest oversize uploads. The actual audio.size check below
    // catches anything that lies about its size.
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (
            Number.isFinite(contentLength) &&
            contentLength > MAX_REQUEST_BYTES
        ) {
            return NextResponse.json(
                {
                    error: "payload_too_large",
                    message: "Request body exceeds size limit",
                },
                { status: 413 },
            );
        }
    }

    // 3. Parse multipart form data
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "invalid_record", message: "Invalid multipart form data" },
            { status: 400 },
        );
    }

    const recordRaw = formData.get("record");
    const audio = formData.get("audio");

    if (typeof recordRaw !== "string" || !recordRaw.trim()) {
        return NextResponse.json(
            { error: "invalid_record", message: "Missing record field" },
            { status: 400 },
        );
    }

    if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json(
            { error: "invalid_record", message: "Missing or empty audio file" },
            { status: 400 },
        );
    }

    // 4. Validate and ingest
    try {
        const record = parseAndValidateRecord(recordRaw);
        const result = await ingestCapture(uid, record, audio);

        return NextResponse.json(
            { capture_id: result.captureId, status: result.status },
            { status: 201 },
        );
    } catch (error) {
        if (error instanceof IngestError) {
            const statusCode =
                error.code === "payload_too_large"
                    ? 413
                    : error.code === "invalid_record" ||
                        error.code === "invalid_audio"
                      ? 400
                      : 500;

            return NextResponse.json(
                { error: error.code, message: error.message },
                { status: statusCode },
            );
        }

        console.error("[api/captures/upload] POST failed", error);
        return NextResponse.json(
            { error: "internal", message: "Failed to store capture" },
            { status: 500 },
        );
    }
}
