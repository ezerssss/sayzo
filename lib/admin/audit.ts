import "server-only";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { AuditAction, AuditLogEntry } from "@/types/audit-log";

/**
 * Append-only audit log writer. Every state-changing admin action MUST call
 * this so we can later answer "who changed what when."
 *
 * Failures are logged but do NOT throw — we'd rather complete the user-facing
 * action than fail it because the log write hiccuped. (The failure is rare
 * and visible in server logs.)
 */
export async function writeAudit(params: {
    actor: { uid: string; email: string };
    action: AuditAction;
    targetId: string;
    targetUid?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    const entry: Omit<AuditLogEntry, "id"> = {
        actorUid: params.actor.uid,
        actorEmail: params.actor.email,
        action: params.action,
        targetId: params.targetId,
        targetUid: params.targetUid ?? null,
        before: params.before ?? null,
        after: params.after ?? null,
        ...(params.metadata ? { metadata: params.metadata } : {}),
        createdAt: new Date().toISOString(),
    };

    try {
        const db = getAdminFirestore();
        await db.collection(FirestoreCollections.auditLog.path).add(entry);
    } catch (error) {
        console.error("[audit] write failed", { action: params.action, error });
    }
}
