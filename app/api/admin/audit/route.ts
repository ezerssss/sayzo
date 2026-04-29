import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { AuditLogEntry } from "@/types/audit-log";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor")?.trim() ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "");
    const limit =
        Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(limitParam, PAGE_SIZE_MAX)
            : PAGE_SIZE_DEFAULT;
    const action = url.searchParams.get("action")?.trim() ?? "";
    const targetUid = url.searchParams.get("targetUid")?.trim() ?? "";

    try {
        const db = getAdminFirestore();
        let query = db
            .collection(FirestoreCollections.auditLog.path)
            .orderBy("createdAt", "desc")
            .limit(limit) as FirebaseFirestore.Query;

        if (action) {
            query = query.where("action", "==", action);
        }
        if (targetUid) {
            query = query.where("targetUid", "==", targetUid);
        }

        if (cursor) {
            const cursorSnap = await db
                .collection(FirestoreCollections.auditLog.path)
                .doc(cursor)
                .get();
            if (cursorSnap.exists) {
                query = query.startAfter(cursorSnap);
            }
        }

        const snap = await query.get();
        const entries = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as AuditLogEntry),
        }));
        const nextCursor =
            snap.size === limit ? snap.docs[snap.size - 1]?.id ?? null : null;

        return NextResponse.json({ entries, nextCursor });
    } catch (error) {
        console.error("[api/admin/audit] GET failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load audit log.",
            },
            { status: 500 },
        );
    }
}
