import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";

export const runtime = "nodejs";

const payloadSchema = z.object({
    action: z.enum(["approve", "deny"]),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
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
    const { action } = parsed.data;

    try {
        const db = getAdminFirestore();
        const requestRef = db
            .collection(FirestoreCollections.accessRequests.path)
            .doc(id);
        const requestSnap = await requestRef.get();
        if (!requestSnap.exists) {
            return NextResponse.json(
                { error: "Access request not found." },
                { status: 404 },
            );
        }
        const accessRequest = requestSnap.data() as {
            uid?: string;
            status?: string;
            email?: string;
        };
        const targetUid = accessRequest.uid ?? "";
        const previousStatus = accessRequest.status ?? "pending";
        const nowIso = new Date().toISOString();

        if (action === "approve") {
            if (!targetUid) {
                return NextResponse.json(
                    { error: "Access request has no uid; cannot approve." },
                    { status: 400 },
                );
            }
            const userRef = db
                .collection(FirestoreCollections.users.path)
                .doc(targetUid);
            const userSnap = await userRef.get();
            if (!userSnap.exists) {
                return NextResponse.json(
                    { error: "User profile no longer exists." },
                    { status: 404 },
                );
            }
            const before = userSnap.data() as UserProfileType;

            await userRef.set(
                {
                    hasFullAccess: true,
                    accessGrantedAt: nowIso,
                    updatedAt: nowIso,
                },
                { merge: true },
            );
            await requestRef.set(
                { status: "approved", reviewedAt: nowIso, reviewedBy: auth.uid },
                { merge: true },
            );

            await writeAudit({
                actor: auth,
                action: "access_request.approve",
                targetId: id,
                targetUid,
                before: {
                    requestStatus: previousStatus,
                    hasFullAccess: before.hasFullAccess ?? null,
                },
                after: {
                    requestStatus: "approved",
                    hasFullAccess: true,
                    accessGrantedAt: nowIso,
                },
            });

            return NextResponse.json({ ok: true });
        }

        // Deny.
        await requestRef.set(
            { status: "denied", reviewedAt: nowIso, reviewedBy: auth.uid },
            { merge: true },
        );
        await writeAudit({
            actor: auth,
            action: "access_request.deny",
            targetId: id,
            targetUid: targetUid || null,
            before: { requestStatus: previousStatus },
            after: { requestStatus: "denied" },
        });
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[api/admin/access-requests/${id}] PATCH failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update access request.",
            },
            { status: 500 },
        );
    }
}
