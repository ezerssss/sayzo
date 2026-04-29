import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SupportReportStatus } from "@/types/support";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

const ALLOWED_STATUSES = new Set<SupportReportStatus>([
    "open",
    "triaged",
    "closed",
]);

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(request.url);
    const status = (url.searchParams.get("status")?.trim() ??
        "open") as SupportReportStatus;
    if (!ALLOWED_STATUSES.has(status)) {
        return NextResponse.json(
            { error: `Unknown status "${status}".` },
            { status: 400 },
        );
    }
    const cursor = url.searchParams.get("cursor")?.trim() ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "");
    const limit =
        Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(limitParam, PAGE_SIZE_MAX)
            : PAGE_SIZE_DEFAULT;

    try {
        const db = getAdminFirestore();
        let query = db
            .collection(FirestoreCollections.supportReports.path)
            .where("status", "==", status)
            .orderBy("createdAt", "desc")
            .limit(limit);

        if (cursor) {
            const cursorSnap = await db
                .collection(FirestoreCollections.supportReports.path)
                .doc(cursor)
                .get();
            if (cursorSnap.exists) {
                query = query.startAfter(cursorSnap);
            }
        }

        const snap = await query.get();
        const reports = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
        }));
        const nextCursor =
            snap.size === limit ? snap.docs[snap.size - 1]?.id ?? null : null;

        return NextResponse.json({ reports, nextCursor });
    } catch (error) {
        console.error("[api/admin/support-reports] GET failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load support reports.",
            },
            { status: 500 },
        );
    }
}
