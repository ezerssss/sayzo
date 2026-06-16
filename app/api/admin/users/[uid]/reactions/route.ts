import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { ItemReaction } from "@/schemas";

export const runtime = "nodejs";

const MAX = 200;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> },
) {
    const { uid } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const db = getAdminFirestore();
        // Equality-only query (single-field index, no composite needed); sort in
        // memory so adding this view doesn't require a new console index.
        const snap = await db
            .collection(FirestoreCollections.itemReactions.path)
            .where("uid", "==", uid)
            .limit(MAX)
            .get();

        const reactions = snap.docs
            .map((d) => ({ ...(d.data() as ItemReaction), id: d.id }))
            .sort((a, b) =>
                (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
            );

        return NextResponse.json({ reactions });
    } catch (error) {
        console.error(`[api/admin/users/${uid}/reactions] GET failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load reactions.",
            },
            { status: 500 },
        );
    }
}
