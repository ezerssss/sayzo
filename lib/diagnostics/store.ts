import "server-only";

import { FirestoreCollections } from "@/schemas";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type {
    DiagnosticLogBlob,
    DiagnosticLogType,
    DiagnosticMeta,
} from "@/schemas/diagnostics/diagnostic-log";

import {
    DiagnosticIngestError,
    MAX_LOG_PARTS,
    diagnosticBlobKey,
    diagnosticDocId,
    gunzipLogPart,
    normalizeCapturedAt,
    plaintextLogName,
} from "./ingest";

/** One gzipped `log` part read off the multipart body. */
export type DiagnosticUploadPart = { filename: string; gz: Buffer };

export type DiagnosticIngestResult = {
    docId: string;
    /** True when the upload already existed (agent retry) — blobs weren't re-stored. */
    deduped: boolean;
    reason: DiagnosticMeta["reason"];
};

/**
 * Gunzip + store each plaintext log blob and record one `diagnostic_logs` row.
 *
 * Idempotent via a deterministic doc id (see `diagnosticDocId`): an agent retry
 * of the same upload short-circuits to `deduped: true` instead of duplicating.
 * The create-race fallback mirrors `lib/user/provision.ts` — a concurrent retry
 * that wins the `.create()` is treated as already-received.
 */
export async function ingestDiagnosticUpload(
    uid: string,
    meta: DiagnosticMeta,
    parts: DiagnosticUploadPart[],
): Promise<DiagnosticIngestResult> {
    if (parts.length === 0) {
        throw new DiagnosticIngestError("invalid_log", "No log parts provided");
    }
    if (parts.length > MAX_LOG_PARTS) {
        throw new DiagnosticIngestError(
            "invalid_log",
            `Too many log parts (max ${MAX_LOG_PARTS})`,
        );
    }

    const now = new Date().toISOString();
    const capturedAt = normalizeCapturedAt(meta.captured_at, now);
    const docId = diagnosticDocId(
        uid,
        meta.install_id,
        capturedAt,
        meta.reason,
    );

    const db = getAdminFirestore();
    const ref = db
        .collection(FirestoreCollections.diagnosticLogs.path)
        .doc(docId);

    // Index-free dedup: a deterministic doc id means a retry lands on the same
    // doc. If it already exists the prior attempt stored it — skip re-storing.
    const existing = await ref.get();
    if (existing.exists) {
        return { docId, deduped: true, reason: meta.reason };
    }

    // Gunzip each part and store as plaintext (the agent ships gzip; we serve
    // plaintext). Storage keys are deterministic, so a concurrent retry that
    // also reaches here just overwrites identical content — safe.
    const bucket = getAdminStorageBucket();
    const blobs: DiagnosticLogBlob[] = [];
    for (const part of parts) {
        const plaintext = gunzipLogPart(part.gz);
        const filename = plaintextLogName(part.filename);
        const storageKey = diagnosticBlobKey(
            uid,
            meta.install_id,
            docId,
            filename,
        );
        try {
            await bucket.file(storageKey).save(plaintext, {
                resumable: false,
                contentType: "text/plain; charset=utf-8",
            });
        } catch (err) {
            throw new DiagnosticIngestError(
                "storage",
                `Failed to store log blob: ${(err as Error).message}`,
            );
        }
        blobs.push({ filename, storageKey, size: plaintext.byteLength });
    }

    const doc: DiagnosticLogType = {
        uid,
        installId: meta.install_id,
        reason: meta.reason,
        version: meta.version,
        platform: meta.platform,
        capturedAt,
        blobs,
        totalSize: blobs.reduce((sum, b) => sum + b.size, 0),
        createdAt: now,
    };

    try {
        await ref.create(doc);
    } catch (err) {
        // Lost a create race with a concurrent retry — re-read; if it exists now,
        // the other writer recorded it (same content). Otherwise surface so the
        // route 500s and the agent retries (transient).
        const recheck = await ref.get();
        if (recheck.exists) {
            return { docId, deduped: true, reason: meta.reason };
        }
        throw new DiagnosticIngestError(
            "storage",
            `Failed to record diagnostic log: ${(err as Error).message}`,
        );
    }

    return { docId, deduped: false, reason: meta.reason };
}
