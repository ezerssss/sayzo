import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { SupportReportType } from "@/types/support";

export const runtime = "nodejs";

const payloadSchema = z.object({
    status: z.enum(["open", "triaged", "closed"]),
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
    const { status } = parsed.data;

    try {
        const db = getAdminFirestore();
        const ref = db
            .collection(FirestoreCollections.supportReports.path)
            .doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Support report not found." },
                { status: 404 },
            );
        }
        const before = snap.data() as SupportReportType;

        await ref.set(
            { status, reviewedAt: new Date().toISOString(), reviewedBy: auth.uid },
            { merge: true },
        );

        await writeAudit({
            actor: auth,
            action: "support_report.status.update",
            targetId: id,
            targetUid: before.uid ?? null,
            before: { status: before.status },
            after: { status },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[api/admin/support-reports/${id}] PATCH failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to update support report.",
            },
            { status: 500 },
        );
    }
}
