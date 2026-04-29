import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

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
            .collection(FirestoreCollections.sessions.path)
            .where("uid", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(limit);

        if (cursor) {
            const cursorSnap = await db
                .collection(FirestoreCollections.sessions.path)
                .doc(cursor)
                .get();
            if (cursorSnap.exists) {
                query = query.startAfter(cursorSnap);
            }
        }

        const snap = await query.get();
        const sessions = snap.docs.map((d) => ({
            ...(d.data() as SessionType),
            id: d.id,
        }));
        const nextCursor =
            snap.size === limit ? snap.docs[snap.size - 1]?.id ?? null : null;

        return NextResponse.json({ sessions, nextCursor });
    } catch (error) {
        console.error(`[api/admin/users/${uid}/sessions] GET failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load sessions.",
            },
            { status: 500 },
        );
    }
}
