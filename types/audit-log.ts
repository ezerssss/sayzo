/**
 * Append-only record of an admin-dashboard mutation. Written by `lib/admin/audit.ts`
 * after every state-changing admin action (credit edit, admin role change, access
 * grant, account delete, support-report transition, job retry, etc.).
 *
 * Never overwritten or deleted by application code — when a target user is
 * cascade-deleted, their audit entries stay so the trail survives the deletion.
 */
export type AuditAction =
    | "user.delete"
    | "user.credits.update"
    | "user.admin.update"
    | "user.access.update"
    | "access_request.approve"
    | "access_request.deny"
    | "support_report.status.update"
    | "capture.retry"
    | "session.retry";

export interface AuditLogEntry {
    /** Firestore doc id (auto). Not stored as a field. */
    id?: string;

    actorUid: string;
    actorEmail: string;
    action: AuditAction;

    /** Subject of the action — uid for user.* actions, doc id for queue actions. */
    targetId: string;
    /** When the target is a user, the uid (== targetId). Null for non-user targets. */
    targetUid: string | null;

    /** Snapshot of the relevant fields BEFORE the change. JSON-serialisable. */
    before: Record<string, unknown> | null;
    /** Snapshot of the relevant fields AFTER the change. JSON-serialisable. */
    after: Record<string, unknown> | null;

    /** Optional free-form context (e.g. { deletedSessionsCount: 12 } for cascade deletes). */
    metadata?: Record<string, unknown>;

    createdAt: string;
}
