import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { verifyAccessToken } from "@/lib/auth/jwt";
import {
    IngestError,
    ingestCapture,
    parseAndValidateRecord,
} from "@/lib/captures/ingest";
import {
    generateQuickSummary,
    inferDurationSecs,
} from "@/lib/captures/quick-summary";
import {
    assertHasCredit,
    consumeCreditOrThrow,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
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

    // 3. Read-only credit gate — reject over-limit users BEFORE buffering the
    // multipart body. The transactional consume runs after the dedup check
    // (step 6) so a retry of an already-uploaded record doesn't burn a credit.
    try {
        await assertHasCredit(uid);
    } catch (err) {
        if (err instanceof CreditLimitReachedError) {
            return creditLimitResponse();
        }
        throw err;
    }

    // 4. Parse multipart form data
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

    // 5. Validate record shape — we need record.id for the dedup check below.
    let record;
    try {
        record = parseAndValidateRecord(recordRaw);
    } catch (error) {
        if (error instanceof IngestError) {
            return NextResponse.json(
                { error: error.code, message: error.message },
                { status: 400 },
            );
        }
        throw error;
    }

    // 6. Dedup — the desktop agent may re-send a record it already uploaded
    // (retry, crash-recover, manual re-run). The agent is known to keep
    // record.id stable across retries, so we can key dedup on (uid, record.id)
    // instead of hashing audio bytes. Requires composite index
    // (uid ASC, agentRecordId ASC) on the `captures` collection.
    //
    // On a hit we return a 201 with the same shape as a fresh success, so the
    // agent can't tell the difference and marks its local record as shipped.
    const db = getAdminFirestore();
    const existing = await db
        .collection(FirestoreCollections.captures.path)
        .where("uid", "==", uid)
        .where("agentRecordId", "==", record.id)
        .limit(1)
        .get();

    if (!existing.empty) {
        const doc = existing.docs[0];
        const data = doc.data() as {
            status?: string;
            title?: string;
            summary?: string;
            serverTitle?: string;
            serverSummary?: string;
            relevantSpan?: [number, number];
        };
        console.info("[api/captures/upload] dedup_hit", {
            uid,
            agentRecordId: record.id,
            captureId: doc.id,
            existingStatus: data.status ?? null,
        });
        return NextResponse.json(
            {
                id: doc.id,
                capture_id: doc.id,
                status: data.status ?? "queued",
                title: data.serverTitle ?? data.title ?? record.title,
                summary: data.serverSummary ?? data.summary ?? "",
                relevant_span: data.relevantSpan ?? record.relevantSpan,
            },
            { status: 201 },
        );
    }

    // 7. Consume credit — only for fresh captures.
    try {
        await consumeCreditOrThrow(uid);
    } catch (err) {
        if (err instanceof CreditLimitReachedError) {
            return creditLimitResponse();
        }
        throw err;
    }

    // 8. Quick title + summary for v2.2.0+ clients. The agent ships a
    // placeholder ("Conversation · 2026-05-02 14:32") and an empty summary
    // and tags `metadata.local_llm_used: false` so we know to generate.
    // Older clients run their own local LLM and we trust their values.
    //
    // Generation is best-effort — on timeout / LLM failure we keep the
    // placeholder so the upload still succeeds. The deep analysis stage
    // produces a better `serverTitle`/`serverSummary` later regardless.
    if (record.metadata.localLlmUsed === false) {
        try {
            const durationSecs = inferDurationSecs(
                record.transcript,
                record.startedAt,
                record.endedAt,
            );
            const quick = await generateQuickSummary({
                transcript: record.transcript,
                closeReason: record.metadata.closeReason,
                durationSecs,
            });
            record = {
                ...record,
                title: quick.title,
                summary: quick.summary,
            };
        } catch (err) {
            console.warn(
                "[api/captures/upload] quick summary generation failed, falling back to placeholder",
                {
                    uid,
                    agentRecordId: record.id,
                    error: err instanceof Error ? err.message : String(err),
                },
            );
        }
    }

    // 9. Ingest
    try {
        const result = await ingestCapture(uid, record, audio);

        return NextResponse.json(
            {
                id: result.captureId,
                capture_id: result.captureId,
                status: result.status,
                title: record.title,
                summary: record.summary,
                relevant_span: record.relevantSpan,
            },
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
