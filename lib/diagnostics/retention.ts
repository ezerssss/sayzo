import "server-only";

import { FirestoreCollections } from "@/schemas";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type { DiagnosticLogType } from "@/schemas/diagnostics/diagnostic-log";

import { retentionCutoffIso, retentionDays } from "./ingest";

export type PruneResult = { docsDeleted: number; blobsDeleted: number };

/**
 * Delete every `diagnostic_logs` row (and its storage blobs) older than the
 * retention window (`DIAGNOSTICS_RETENTION_DAYS`, default 30d). Keeps the agent's
 * opt-out posture honest: nothing is held longer than disclosed. Best-effort per
 * blob/doc (a single failure logs + continues); driven by the CRON_SECRET-guarded
 * `POST /api/diagnostics/prune` (registered in `instrumentation.ts`).
 *
 * The `createdAt <` inequality + `orderBy(createdAt)` uses an auto-created
 * single-field index — no composite index needed.
 */
export async function pruneExpiredDiagnosticLogs(): Promise<PruneResult> {
    const db = getAdminFirestore();
    const bucket = getAdminStorageBucket();
    const cutoff = retentionCutoffIso(new Date(), retentionDays());
    const ref = db.collection(FirestoreCollections.diagnosticLogs.path);

    const result: PruneResult = { docsDeleted: 0, blobsDeleted: 0 };
    const PAGE = 200;

    // Each pass re-queries from the start; deleting the matched docs naturally
    // advances the window (same pattern as cascade-delete's deleteByEqual).
    while (true) {
        const snap = await ref
            .where("createdAt", "<", cutoff)
            .orderBy("createdAt", "asc")
            .limit(PAGE)
            .get();
        if (snap.empty) break;

        for (const doc of snap.docs) {
            const data = doc.data() as DiagnosticLogType;
            for (const blob of data.blobs ?? []) {
                try {
                    await bucket
                        .file(blob.storageKey)
                        .delete({ ignoreNotFound: true });
                    result.blobsDeleted += 1;
                } catch (err) {
                    console.warn(
                        `[diagnostics/retention] blob delete failed: ${blob.storageKey}`,
                        err,
                    );
                }
            }
            try {
                await doc.ref.delete();
                result.docsDeleted += 1;
            } catch (err) {
                console.warn(
                    `[diagnostics/retention] doc delete failed: ${doc.id}`,
                    err,
                );
            }
        }

        if (snap.size < PAGE) break;
    }

    return result;
}
