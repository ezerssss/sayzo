import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { DiagnosticLogType } from "@/schemas";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

/**
 * List a user's uploaded diagnostic logs, newest first. Mirrors
 * `…/[uid]/captures/route.ts`.
 *
 * NOTE: `where("uid","==",…).orderBy("createdAt","desc")` requires a composite
 * index on `(uid ASC, createdAt DESC)` for `diagnostic_logs` — Firestore prints
 * the one-click create link in the server logs on first query.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> },
) {
    const { uid } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor")?.trim() ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "");
    const limit =
        Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(limitParam, PAGE_SIZE_MAX)
            : PAGE_SIZE_DEFAULT;

    try {
        const db = getAdminFirestore();
        let query = db
            .collection(FirestoreCollections.diagnosticLogs.path)
            .where("uid", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(limit);

        if (cursor) {
            const cursorSnap = await db
                .collection(FirestoreCollections.diagnosticLogs.path)
                .doc(cursor)
                .get();
            if (cursorSnap.exists) {
                query = query.startAfter(cursorSnap);
            }
        }

        const snap = await query.get();
        const logs = snap.docs.map((d) => ({
            ...(d.data() as DiagnosticLogType),
            id: d.id,
        }));
        const nextCursor =
            snap.size === limit ? snap.docs[snap.size - 1]?.id ?? null : null;

        return NextResponse.json({ logs, nextCursor });
    } catch (error) {
        console.error(
            `[api/admin/users/${uid}/diagnostics] GET failed`,
            error,
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load diagnostic logs.",
            },
            { status: 500 },
        );
    }
}
