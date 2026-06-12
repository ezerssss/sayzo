import { z } from "zod";

/**
 * Remote diagnostics from the desktop companion (shipped agent-side in v3.16.0).
 *
 * Diagnostic logs are plain text and PII/content-free BY DESIGN — no meeting
 * audio, no transcripts, no auth tokens, no email. They are low-sensitivity but
 * still tied to a user, so collection is disclosed in the privacy policy, opt-out
 * on the agent (default on, user-toggleable), retention-bounded (auto-pruned, see
 * `lib/diagnostics/retention.ts`), and deletable on request.
 *
 * Zod is the source of truth for the wire `meta` shape; the persisted Firestore
 * doc is a plain TS type co-located here.
 */

/** Why the agent shipped this log. `on_demand` is an admin-triggered pull. */
export const DIAGNOSTIC_REASONS = ["crash", "on_demand", "manual"] as const;
export type DiagnosticReason = (typeof DIAGNOSTIC_REASONS)[number];

/**
 * The `meta` JSON part of a `POST /api/diagnostics/upload` multipart body, exactly
 * as the agent sends it (snake_case wire format).
 *
 * Validation is deliberately LENIENT: the agent treats any non-401 4xx as a
 * PERMANENT failure and drops the log, so over-strict validation silently loses
 * diagnostics. Only `install_id` is strict (we key storage on it). `captured_at`
 * is accepted as any string and normalized best-effort by `parseMeta` — never a
 * hard reject. `version`/`platform` are length-capped to bound storage, not parsed.
 */
export const diagnosticMetaSchema = z.object({
    version: z.string().min(1).max(64),
    platform: z.string().min(1).max(256),
    /** uuid4().hex — 32 lowercase hex chars, no dashes. Stable per install. */
    install_id: z.string().regex(/^[0-9a-f]{32}$/),
    reason: z.enum(DIAGNOSTIC_REASONS),
    /** ISO8601 UTC. Accepted as a free string here; normalized in parseMeta. */
    captured_at: z.string().min(1).max(64),
});

export type DiagnosticMeta = z.infer<typeof diagnosticMetaSchema>;

/** One stored, gunzipped log file from an upload. */
export type DiagnosticLogBlob = {
    /** Plaintext filename (`.gz` stripped), e.g. `agent.log`, `agent.log.1`. */
    filename: string;
    /** Cloud Storage object key. */
    storageKey: string;
    /** Decompressed (stored) size in bytes. */
    size: number;
};

/**
 * One `diagnostic_logs/{id}` row — a single upload event (which may carry up to 6
 * log parts). Doc id is deterministic (see `diagnosticDocId`) so an agent retry
 * of the same upload overwrites rather than duplicates.
 *
 * Server-only collection: admin read, no client write (firestore.rules). The
 * Admin SDK is the only writer.
 */
export type DiagnosticLogType = {
    /** Firestore document ID — mapped from `doc.id`, not stored as a field. */
    id?: string;
    uid: string;
    installId: string;
    reason: DiagnosticReason;
    version: string;
    platform: string;
    /** Normalized ISO timestamp from `meta.captured_at` (or server time on a bad value). */
    capturedAt: string;
    blobs: DiagnosticLogBlob[];
    /** Sum of `blobs[].size` — decompressed bytes stored for this upload. */
    totalSize: number;
    /** ISO 8601 server-receipt time. Drives retention pruning. */
    createdAt: string;
};
