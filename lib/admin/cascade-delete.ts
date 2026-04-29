import "server-only";

import { getAuth } from "firebase-admin/auth";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    getAdminFirestore,
    getAdminStorageBucket,
    getFirebaseAdminApp,
} from "@/lib/firebase/admin";
import { writeAudit } from "@/lib/admin/audit";
import type { AuthedUser } from "@/lib/auth/require-auth";

/**
 * Counts of records cleared during a cascade delete. Returned to the API
 * response so the admin sees what was touched, and recorded in the audit log.
 */
export interface CascadeDeleteResult {
    uid: string;
    storageObjectsDeleted: number;
    sessionsDeleted: number;
    capturesDeleted: number;
    accessRequestsDeleted: number;
    supportReportsDeleted: number;
    refreshTokensDeleted: number;
    authCodesDeleted: number;
    profileExisted: boolean;
    skillMemoryExisted: boolean;
    focusInsightsExisted: boolean;
    authUserDeleted: boolean;
}

/**
 * Hard-delete every trace of a user. Order matters:
 *   1. Disable Firebase Auth (kills sessions instantly; record still exists
 *      so we can audit and finish cleanup).
 *   2. Storage prefixes — drill audio (`{uid}/...`) and capture audio
 *      (`captures/{uid}/...`).
 *   3. uid-keyed Firestore docs (users, skill-memories, user-focus-insights).
 *   4. uid-field queries (sessions, captures, access_requests, support_reports).
 *   5. firebaseUid-field scans (refresh_tokens, auth_codes — short-TTL but
 *      still removed for completeness).
 *   6. Audit log entry capturing the snapshot.
 *   7. Final Firebase Auth `deleteUser`.
 *
 * Each step is best-effort: errors at one step are logged and the chain
 * continues so that a transient hiccup doesn't leave the account half-deleted
 * forever. Re-running the function is idempotent for the parts that
 * succeeded.
 */
export async function deleteUserCompletely(
    targetUid: string,
    actor: AuthedUser,
): Promise<CascadeDeleteResult> {
    const db = getAdminFirestore();
    const bucket = getAdminStorageBucket();
    const adminAuth = getAuth(getFirebaseAdminApp());

    const result: CascadeDeleteResult = {
        uid: targetUid,
        storageObjectsDeleted: 0,
        sessionsDeleted: 0,
        capturesDeleted: 0,
        accessRequestsDeleted: 0,
        supportReportsDeleted: 0,
        refreshTokensDeleted: 0,
        authCodesDeleted: 0,
        profileExisted: false,
        skillMemoryExisted: false,
        focusInsightsExisted: false,
        authUserDeleted: false,
    };

    // 1. Disable Firebase Auth user so any in-flight client loses access now.
    try {
        await adminAuth.updateUser(targetUid, { disabled: true });
    } catch (error) {
        console.warn(
            `[cascade-delete] could not disable auth user ${targetUid}`,
            error,
        );
    }

    // 2. Storage. Drill audio lives under `{uid}/`; capture audio under
    //    `captures/{uid}/`. tts-cache is global and not user-scoped.
    for (const prefix of [`${targetUid}/`, `captures/${targetUid}/`]) {
        try {
            const [files] = await bucket.getFiles({ prefix });
            await Promise.all(
                files.map((file) =>
                    file.delete({ ignoreNotFound: true }).catch((e) => {
                        console.warn(
                            `[cascade-delete] file delete failed: ${file.name}`,
                            e,
                        );
                    }),
                ),
            );
            result.storageObjectsDeleted += files.length;
        } catch (error) {
            console.warn(
                `[cascade-delete] listing storage prefix "${prefix}" failed`,
                error,
            );
        }
    }

    // 3. uid-keyed Firestore docs. Capture a snapshot of the profile BEFORE
    //    delete so the audit log carries the "before" state.
    let profileBefore: Record<string, unknown> | null = null;
    try {
        const profileRef = db
            .collection(FirestoreCollections.users.path)
            .doc(targetUid);
        const snap = await profileRef.get();
        if (snap.exists) {
            result.profileExisted = true;
            profileBefore = snap.data() as Record<string, unknown>;
            await profileRef.delete();
        }
    } catch (error) {
        console.warn("[cascade-delete] users delete failed", error);
    }

    try {
        const skillRef = db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(targetUid);
        const snap = await skillRef.get();
        if (snap.exists) {
            result.skillMemoryExisted = true;
            await skillRef.delete();
        }
    } catch (error) {
        console.warn("[cascade-delete] skill-memories delete failed", error);
    }

    try {
        const focusRef = db
            .collection(FirestoreCollections.userFocusInsights.path)
            .doc(targetUid);
        const snap = await focusRef.get();
        if (snap.exists) {
            result.focusInsightsExisted = true;
            await focusRef.delete();
        }
    } catch (error) {
        console.warn(
            "[cascade-delete] user-focus-insights delete failed",
            error,
        );
    }

    // 4. uid-field queries. Pages of 400 well under the 500/batch limit.
    result.sessionsDeleted = await deleteByEqual(
        FirestoreCollections.sessions.path,
        "uid",
        targetUid,
    );
    result.capturesDeleted = await deleteByEqual(
        FirestoreCollections.captures.path,
        "uid",
        targetUid,
    );
    result.accessRequestsDeleted = await deleteByEqual(
        FirestoreCollections.accessRequests.path,
        "uid",
        targetUid,
    );
    result.supportReportsDeleted = await deleteByEqual(
        FirestoreCollections.supportReports.path,
        "uid",
        targetUid,
    );

    // 5. firebaseUid-field scans for auth-flow tables.
    result.refreshTokensDeleted = await deleteByEqual(
        FirestoreCollections.refreshTokens.path,
        "firebaseUid",
        targetUid,
    );
    result.authCodesDeleted = await deleteByEqual(
        FirestoreCollections.authCodes.path,
        "firebaseUid",
        targetUid,
    );

    // 6. Audit log. Written BEFORE final auth deletion so the actor's
    //    permissions are still established.
    await writeAudit({
        actor,
        action: "user.delete",
        targetId: targetUid,
        targetUid,
        before: profileBefore,
        after: null,
        metadata: {
            storageObjectsDeleted: result.storageObjectsDeleted,
            sessionsDeleted: result.sessionsDeleted,
            capturesDeleted: result.capturesDeleted,
            accessRequestsDeleted: result.accessRequestsDeleted,
            supportReportsDeleted: result.supportReportsDeleted,
            refreshTokensDeleted: result.refreshTokensDeleted,
            authCodesDeleted: result.authCodesDeleted,
            skillMemoryExisted: result.skillMemoryExisted,
            focusInsightsExisted: result.focusInsightsExisted,
        },
    });

    // 7. Final auth deletion.
    try {
        await adminAuth.deleteUser(targetUid);
        result.authUserDeleted = true;
    } catch (error) {
        const code =
            typeof error === "object" && error && "code" in error
                ? String((error as { code: unknown }).code)
                : "";
        if (code === "auth/user-not-found") {
            result.authUserDeleted = true;
        } else {
            console.warn(
                `[cascade-delete] final auth deletion failed for ${targetUid}`,
                error,
            );
        }
    }

    return result;
}

/**
 * Delete every doc in `collectionPath` where `field == value`. Pages in
 * batches of 400. Returns the number of docs deleted.
 */
async function deleteByEqual(
    collectionPath: string,
    field: string,
    value: string,
): Promise<number> {
    const db = getAdminFirestore();
    const ref = db.collection(collectionPath);
    const PAGE = 400;
    let totalDeleted = 0;

    while (true) {
        const snap = await ref.where(field, "==", value).limit(PAGE).get();
        if (snap.empty) break;
        const batch = db.batch();
        for (const doc of snap.docs) {
            batch.delete(doc.ref);
        }
        try {
            await batch.commit();
            totalDeleted += snap.size;
        } catch (error) {
            console.warn(
                `[cascade-delete] batch commit failed (${collectionPath}/${field}=${value})`,
                error,
            );
            break;
        }
        if (snap.size < PAGE) break;
    }

    return totalDeleted;
}
