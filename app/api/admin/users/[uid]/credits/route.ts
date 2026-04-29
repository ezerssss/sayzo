import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";

export const runtime = "nodejs";

const payloadSchema = z
    .object({
        creditsUsed: z.number().int().min(0).max(100_000).optional(),
        creditsLimit: z.number().int().min(0).max(100_000).optional(),
        hasFullAccess: z.boolean().optional(),
        /** When granting full access via this endpoint, set accessGrantedAt. */
        markAccessGrantedAt: z.boolean().optional(),
    })
    .refine(
        (v) =>
            v.creditsUsed !== undefined ||
            v.creditsLimit !== undefined ||
            v.hasFullAccess !== undefined,
        { message: "At least one credit field must be provided." },
    );

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
    const body = parsed.data;

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

        const updates: Partial<UserProfileType> = {
            updatedAt: new Date().toISOString(),
        };
        if (body.creditsUsed !== undefined) {
            updates.creditsUsed = body.creditsUsed;
        }
        if (body.creditsLimit !== undefined) {
            updates.creditsLimit = body.creditsLimit;
        }
        if (body.hasFullAccess !== undefined) {
            updates.hasFullAccess = body.hasFullAccess;
            if (body.hasFullAccess && body.markAccessGrantedAt !== false) {
                updates.accessGrantedAt = new Date().toISOString();
            }
        }

        await ref.set(updates, { merge: true });

        await writeAudit({
            actor: auth,
            action: "user.credits.update",
            targetId: uid,
            targetUid: uid,
            before: {
                creditsUsed: before.creditsUsed ?? null,
                creditsLimit: before.creditsLimit ?? null,
                hasFullAccess: before.hasFullAccess ?? null,
                accessGrantedAt: before.accessGrantedAt ?? null,
            },
            after: {
                creditsUsed:
                    updates.creditsUsed ?? before.creditsUsed ?? null,
                creditsLimit:
                    updates.creditsLimit ?? before.creditsLimit ?? null,
                hasFullAccess:
                    updates.hasFullAccess ?? before.hasFullAccess ?? null,
                accessGrantedAt:
                    updates.accessGrantedAt ?? before.accessGrantedAt ?? null,
            },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[api/admin/users/${uid}/credits] PATCH failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update credits.",
            },
            { status: 500 },
        );
    }
}
