import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type { DiagnosticLogType } from "@/schemas";

export const runtime = "nodejs";

/**
 * Delete a single diagnostic-logs row + its storage blobs. Honors a targeted
 * delete-on-request (GDPR/CCPA) without deleting the whole account. Account-wide
 * deletion is handled by the cascade-delete (lib/admin/cascade-delete.ts).
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const db = getAdminFirestore();
        const ref = db
            .collection(FirestoreCollections.diagnosticLogs.path)
            .doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Diagnostic log not found." },
                { status: 404 },
            );
        }
        const log = snap.data() as DiagnosticLogType;

        const bucket = getAdminStorageBucket();
        let blobsDeleted = 0;
        for (const blob of log.blobs ?? []) {
            try {
                await bucket
                    .file(blob.storageKey)
                    .delete({ ignoreNotFound: true });
                blobsDeleted += 1;
            } catch (err) {
                console.warn(
                    `[api/admin/diagnostics/${id}] blob delete failed: ${blob.storageKey}`,
                    err,
                );
            }
        }

        await ref.delete();

        await writeAudit({
            actor: auth,
            action: "diagnostic_log.delete",
            targetId: id,
            targetUid: log.uid,
            before: {
                installId: log.installId,
                reason: log.reason,
                version: log.version,
                createdAt: log.createdAt,
            },
            after: null,
            metadata: { blobsDeleted },
        });

        return NextResponse.json({ ok: true, blobsDeleted });
    } catch (error) {
        console.error(`[api/admin/diagnostics/${id}] DELETE failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to delete diagnostic log.",
            },
            { status: 500 },
        );
    }
}
