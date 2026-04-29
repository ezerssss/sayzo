import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";

export const runtime = "nodejs";

const payloadSchema = z.object({
    isAdmin: z.boolean(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> },
) {
    const { uid } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    if (uid === auth.uid) {
        return NextResponse.json(
            {
                error:
                    "Refusing to change your own admin status. Ask another admin to do it.",
            },
            { status: 400 },
        );
    }

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
            { status: 400 },
        );
    }
    const { isAdmin } = parsed.data;

    try {
        const db = getAdminFirestore();
        const ref = db.collection(FirestoreCollections.users.path).doc(uid);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }
        const before = snap.data() as UserProfileType;
        const wasAdmin = before.isAdmin === true;
        if (wasAdmin === isAdmin) {
            return NextResponse.json({ ok: true, unchanged: true });
        }

        await ref.set(
            {
                isAdmin,
                updatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        await writeAudit({
            actor: auth,
            action: "user.admin.update",
            targetId: uid,
            targetUid: uid,
            before: { isAdmin: wasAdmin },
            after: { isAdmin },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[api/admin/users/${uid}/admin] PATCH failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update admin status.",
            },
            { status: 500 },
        );
    }
}
