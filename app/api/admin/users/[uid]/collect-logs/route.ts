import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FirestoreCollections } from "@/schemas";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/schemas";

export const runtime = "nodejs";

const payloadSchema = z.object({ collectLogs: z.boolean() });

/**
 * Flip the on-demand diagnostics pull flag for a user. When true, the next
 * `GET /api/me` returns `collect_logs: true` and the agent uploads its current
 * log on its next poll; receipt of that `on_demand` upload clears it back to
 * false (one-shot). Mirrors `…/[uid]/admin/route.ts`.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> },
) {
    const { uid } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

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

        await ref.set(
            {
                collectLogs: parsed.data.collectLogs,
                updatedAt: new Date().toISOString(),
            },
            { merge: true },
        );

        await writeAudit({
            actor: auth,
            action: "user.collect_logs.update",
            targetId: uid,
            targetUid: uid,
            before: { collectLogs: before.collectLogs ?? null },
            after: { collectLogs: parsed.data.collectLogs },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(
            `[api/admin/users/${uid}/collect-logs] PATCH failed`,
            error,
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update collect-logs flag.",
            },
            { status: 500 },
        );
    }
}
