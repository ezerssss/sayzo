import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
    diagnosticMetaSchema,
    type DiagnosticMeta,
} from "@/schemas/diagnostics/diagnostic-log";

/**
 * Pure validation + encoding for the diagnostics upload pipeline. NO Firebase
 * here (the actual store/prune I/O lives in `lib/diagnostics/store.ts`) so these
 * are unit-testable and importable from the route without pulling the Admin SDK
 * into anything that only needs the constants.
 */

/** Whole multipart body cap — rejected via Content-Length before buffering. */
export const MAX_REQUEST_BYTES = 64 * 1024 * 1024; // ~64 MB
/** Per gzipped `log` part. The agent ships ≤ ~12 MB gz per part. */
export const MAX_PART_GZ_BYTES = 12 * 1024 * 1024;
/** Max parts per upload (`agent.log.gz` + `agent.log.1.gz` … `.5.gz`). */
export const MAX_LOG_PARTS = 6;
/** Decompressed cap per part — zip-bomb guard for `gunzipSync`. */
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;

export type DiagnosticIngestCode =
    | "invalid_meta"
    | "invalid_log"
    | "too_large"
    | "storage";

export class DiagnosticIngestError extends Error {
    constructor(
        public code: DiagnosticIngestCode,
        message: string,
    ) {
        super(message);
        this.name = "DiagnosticIngestError";
    }
}

/**
 * Validate + parse the `meta` JSON part. `install_id` is strict (we key storage
 * on it); everything else is lenient because the agent treats any non-401 4xx as
 * a PERMANENT drop — an over-strict reject silently loses the diagnostic.
 */
export function parseMeta(raw: string): DiagnosticMeta {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new DiagnosticIngestError("invalid_meta", "meta is not valid JSON");
    }
    const result = diagnosticMetaSchema.safeParse(parsed);
    if (!result.success) {
        throw new DiagnosticIngestError(
            "invalid_meta",
            result.error.issues[0]?.message ?? "Invalid meta",
        );
    }
    return result.data;
}

/**
 * Normalize `meta.captured_at` to ISO. An unparseable timestamp falls back to
 * `fallbackNow` rather than rejecting — see the leniency note on `parseMeta`.
 */
export function normalizeCapturedAt(
    capturedAt: string,
    fallbackNow: string,
): string {
    const t = new Date(capturedAt);
    return Number.isNaN(t.getTime()) ? fallbackNow : t.toISOString();
}

/** Strip a trailing `.gz` (and any path) from a part filename: `agent.log.gz` → `agent.log`. */
export function plaintextLogName(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? filename;
    return base.replace(/\.gz$/i, "");
}

/** Gunzip one log part with a hard output cap (zip-bomb guard). */
export function gunzipLogPart(gz: Buffer): Buffer {
    try {
        return gunzipSync(gz, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
    } catch (err) {
        throw new DiagnosticIngestError(
            "invalid_log",
            `Failed to gunzip log part: ${(err as Error).message}`,
        );
    }
}

/**
 * Deterministic doc id from the upload's identity. Index-free dedup: an agent
 * retry of the same upload (same uid + install + captured_at + reason) lands on
 * the same doc and the same storage keys, so a retry never duplicates.
 */
export function diagnosticDocId(
    uid: string,
    installId: string,
    capturedAt: string,
    reason: string,
): string {
    return createHash("sha256")
        .update(`${uid}:${installId}:${capturedAt}:${reason}`)
        .digest("hex")
        .slice(0, 40);
}

/** Cloud Storage object key for one stored plaintext blob. */
export function diagnosticBlobKey(
    uid: string,
    installId: string,
    docId: string,
    filename: string,
): string {
    return `diagnostics/${uid}/${installId}/${docId}/${filename}`;
}

/** Retention window in days — `DIAGNOSTICS_RETENTION_DAYS` env, default 30. */
export function retentionDays(): number {
    const raw = Number(process.env.DIAGNOSTICS_RETENTION_DAYS);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

/** ISO cutoff: `diagnostic_logs` with `createdAt` strictly before this are expired. */
export function retentionCutoffIso(now: Date, days: number): string {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
