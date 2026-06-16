import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections, alertStatusSchema } from "@/schemas";
import type { AdminAlert } from "@/schemas";
import { writeAudit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const onlyOpen =
            new URL(request.url).searchParams.get("status") === "open";
        const db = getAdminFirestore();
        const snap = await db
            .collection(FirestoreCollections.adminAlerts.path)
            .get();

        let alerts = snap.docs.map((d) => ({
            ...(d.data() as AdminAlert),
            id: d.id,
        }));
        if (onlyOpen) {
            alerts = alerts.filter((a) => a.status === "open");
        }
        // Open first, then most-recently-seen.
        alerts.sort((a, b) => {
            if (a.status !== b.status) return a.status === "open" ? -1 : 1;
            return (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "");
        });

        return NextResponse.json({ alerts });
    } catch (error) {
        console.error("[api/admin/alerts] GET failed", error);
        return NextResponse.json(
            { error: "Failed to load alerts." },
            { status: 500 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    let body: { id?: unknown; status?: unknown; note?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id : "";
    const statusParse = alertStatusSchema.safeParse(body.status);
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
    if (!id || !statusParse.success) {
        return NextResponse.json(
            { error: "Missing or invalid id/status." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const ref = db
            .collection(FirestoreCollections.adminAlerts.path)
            .doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Alert not found." },
                { status: 404 },
            );
        }
        const before = snap.data() as AdminAlert;
        await ref.set({ status: statusParse.data, note }, { merge: true });

        await writeAudit({
            actor: { uid: auth.uid, email: auth.email },
            action: "alert.status.update",
            targetId: id,
            before: { status: before.status },
            after: { status: statusParse.data, note },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api/admin/alerts] PATCH failed", error);
        return NextResponse.json(
            { error: "Failed to update alert." },
            { status: 500 },
        );
    }
}
