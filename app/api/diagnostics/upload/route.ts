import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    DiagnosticIngestError,
    MAX_LOG_PARTS,
    MAX_PART_GZ_BYTES,
    MAX_REQUEST_BYTES,
    parseMeta,
} from "@/lib/diagnostics/ingest";
import {
    type DiagnosticUploadPart,
    ingestDiagnosticUpload,
} from "@/lib/diagnostics/store";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Remote-diagnostics upload from the desktop companion (shipped agent-side in
 * v3.16.0). Mirrors POST /api/captures/upload's auth + multipart + size-limit
 * shape. Logs are plain text, PII/content-free by design — see the schema +
 * privacy policy.
 *
 * Multipart parts:
 *   - `meta` — JSON string: { version, platform, install_id, reason, captured_at }
 *   - `log`  — one or more gzipped file parts (SAME field name for every part),
 *              filenames `agent.log.gz` and `agent.log.1.gz` … `agent.log.5.gz`.
 *
 * Returns 200 { ok: true }. The agent treats 401 as refresh+retry, 408/429/5xx +
 * network as transient, other 4xx as permanent — and is non-fatal regardless.
 */
export async function POST(request: NextRequest) {
    // 1. Authenticate — agent bearer token (also accepts a webapp token; harmless).
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    // 2. Cheap pre-check: reject oversized bodies before buffering them. The
    //    Content-Length is a client hint; per-part size checks below are the
    //    real guard.
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (
            Number.isFinite(contentLength) &&
            contentLength > MAX_REQUEST_BYTES
        ) {
            return NextResponse.json(
                { error: "payload_too_large" },
                { status: 413 },
            );
        }
    }

    // 3. Parse multipart form data.
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "invalid_meta", message: "Invalid multipart form data" },
            { status: 400 },
        );
    }

    // `meta` is a JSON string. Accept it whether the agent encoded it as a plain
    // text field or as a file part (content-type application/json) — both reach
    // us here, and an over-strict reject would permanently drop the upload.
    const metaPart = formData.get("meta");
    const metaRaw =
        typeof metaPart === "string"
            ? metaPart
            : metaPart instanceof File
              ? await metaPart.text()
              : "";
    if (!metaRaw.trim()) {
        return NextResponse.json(
            { error: "invalid_meta", message: "Missing meta field" },
            { status: 400 },
        );
    }

    let meta;
    try {
        meta = parseMeta(metaRaw);
    } catch (error) {
        return diagnosticErrorResponse(error);
    }

    // 4. Collect log parts — all share the field name `log`, filenames vary.
    const fileParts = formData
        .getAll("log")
        .filter((p): p is File => p instanceof File);

    if (fileParts.length === 0) {
        return NextResponse.json(
            { error: "invalid_log", message: "Missing log file part(s)" },
            { status: 400 },
        );
    }
    if (fileParts.length > MAX_LOG_PARTS) {
        return NextResponse.json(
            {
                error: "invalid_log",
                message: `Too many log parts (max ${MAX_LOG_PARTS})`,
            },
            { status: 400 },
        );
    }
    for (const file of fileParts) {
        if (file.size === 0) {
            return NextResponse.json(
                { error: "invalid_log", message: "Empty log part" },
                { status: 400 },
            );
        }
        if (file.size > MAX_PART_GZ_BYTES) {
            return NextResponse.json(
                { error: "payload_too_large", message: "Log part too large" },
                { status: 413 },
            );
        }
    }

    const parts: DiagnosticUploadPart[] = [];
    for (const file of fileParts) {
        parts.push({
            filename: file.name,
            gz: Buffer.from(await file.arrayBuffer()),
        });
    }

    // 5. Gunzip + store + record the row.
    let result;
    try {
        result = await ingestDiagnosticUpload(uid, meta, parts);
    } catch (error) {
        return diagnosticErrorResponse(error);
    }

    // 6. One-shot clear of the on-demand pull flag — on BOTH the fresh and the
    //    deduped (retry) path, since the retry may exist precisely because an
    //    earlier clear failed. Best-effort: a failure here just leaves the flag
    //    set, so the agent uploads again next poll (deduped) and we retry the
    //    clear — self-healing within one poll interval (≤6h).
    //
    //    `.update()` (NOT `set({merge:true})`) is deliberate: update throws
    //    NOT_FOUND on a missing doc, which the catch below swallows. A merge-set
    //    would CREATE the doc, resurrecting a user hard-deleted between the
    //    agent's `collect_logs:true` read and this upload landing — the same
    //    no-provision-on-write invariant /api/me protects.
    if (result.reason === "on_demand") {
        try {
            await getAdminFirestore()
                .collection(FirestoreCollections.users.path)
                .doc(uid)
                .update({ collectLogs: false });
        } catch (error) {
            console.warn(
                "[api/diagnostics/upload] failed to clear collectLogs",
                { uid, error },
            );
        }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
}

function diagnosticErrorResponse(error: unknown): NextResponse {
    if (error instanceof DiagnosticIngestError) {
        const status =
            error.code === "too_large"
                ? 413
                : error.code === "storage"
                  ? 500
                  : 400; // invalid_meta | invalid_log
        return NextResponse.json(
            { error: error.code, message: error.message },
            { status },
        );
    }
    console.error("[api/diagnostics/upload] POST failed", error);
    return NextResponse.json(
        { error: "internal", message: "Failed to store diagnostics" },
        { status: 500 },
    );
}
