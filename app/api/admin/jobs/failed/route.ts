import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { CaptureStatus, CaptureType } from "@/types/captures";
import type { SessionType } from "@/types/sessions";

export const runtime = "nodejs";

const FAILED_CAPTURE_STATUSES: CaptureStatus[] = [
    "transcribe_failed",
    "validate_failed",
    "analyze_failed",
    "profile_failed",
];

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const db = getAdminFirestore();

        const [sessionsSnap, capturesSnap] = await Promise.all([
            db
                .collection(FirestoreCollections.sessions.path)
                .where("processingStatus", "==", "failed")
                .orderBy("processingUpdatedAt", "desc")
                .limit(PAGE_SIZE)
                .get()
                .catch((error) => {
                    console.warn(
                        "[api/admin/jobs/failed] sessions query failed (likely missing index)",
                        error,
                    );
                    return null;
                }),
            db
                .collection(FirestoreCollections.captures.path)
                .where("status", "in", FAILED_CAPTURE_STATUSES)
                .orderBy("uploadedAt", "desc")
                .limit(PAGE_SIZE)
                .get()
                .catch((error) => {
                    console.warn(
                        "[api/admin/jobs/failed] captures query failed (likely missing index)",
                        error,
                    );
                    return null;
                }),
        ]);

        const sessions =
            sessionsSnap?.docs.map((d) => ({
                ...(d.data() as SessionType),
                id: d.id,
            })) ?? [];
        const captures =
            capturesSnap?.docs.map((d) => ({
                ...(d.data() as CaptureType),
                id: d.id,
            })) ?? [];

        return NextResponse.json({
            sessions,
            captures,
            indexHint:
                sessionsSnap === null || capturesSnap === null
                    ? "One of the queries needed a Firestore composite index. Check the server logs for the index-creation link."
                    : undefined,
        });
    } catch (error) {
        console.error("[api/admin/jobs/failed] GET failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load failed jobs.",
            },
            { status: 500 },
        );
    }
}
