import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
    getAdminFirestore,
    getAdminStorageBucket,
} from "@/lib/firebase/admin";
import type { DiagnosticLogType } from "@/schemas";

export const runtime = "nodejs";

/**
 * Stream one plaintext log blob of a diagnostic-logs row to an admin.
 *
 * The bytes flow THROUGH this admin-authed route (not via a signed URL) on
 * purpose: storage.rules deny all client access with no admin bypass, so a
 * hijacked admin browser session can't enumerate or share arbitrary logs.
 * `?blob=<index>` selects the part (default 0).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(request.url);
    const blobIndex = Number(url.searchParams.get("blob") ?? "0");

    try {
        const db = getAdminFirestore();
        const snap = await db
            .collection(FirestoreCollections.diagnosticLogs.path)
            .doc(id)
            .get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Diagnostic log not found." },
                { status: 404 },
            );
        }
        const log = snap.data() as DiagnosticLogType;
        const blob = log.blobs?.[blobIndex];
        if (!blob) {
            return NextResponse.json(
                { error: "Log blob not found." },
                { status: 404 },
            );
        }

        const bucket = getAdminStorageBucket();
        const [contents] = await bucket.file(blob.storageKey).download();

        return new NextResponse(new Uint8Array(contents), {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": `attachment; filename="${blob.filename.replace(/"/g, "")}"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (error) {
        console.error(
            `[api/admin/diagnostics/${id}/download] GET failed`,
            error,
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to download log.",
            },
            { status: 500 },
        );
    }
}
