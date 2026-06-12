import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    FirestoreCollections,
    TOUR_STEP_IDS,
    TOUR_STEP_ID_SET,
} from "@/schemas";
import type { TourStepId } from "@/schemas";

export const runtime = "nodejs";

type SeenPayload = { stepIds?: unknown };

/**
 * Marks page-guide spotlight steps as seen for the signed-in user
 * (`users/{uid}.seenTourSteps`, the doc is server-write-only). Idempotent —
 * arrayUnion dedupes — so the client fires-and-forgets per step shown plus a
 * batch on "Skip tour".
 */
export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let payload: SeenPayload;
    try {
        payload = (await request.json()) as SeenPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const raw = Array.isArray(payload.stepIds) ? payload.stepIds : null;
    if (!raw || raw.length === 0 || raw.length > TOUR_STEP_IDS.length) {
        return NextResponse.json(
            { error: "stepIds must be a non-empty array of step ids." },
            { status: 400 },
        );
    }
    const unique = [...new Set(raw)];
    const stepIds = unique.filter(
        (id): id is TourStepId =>
            typeof id === "string" && TOUR_STEP_ID_SET.has(id),
    );
    if (stepIds.length !== unique.length) {
        // An unknown id means the client registry and the schema allowlist
        // drifted — reject loudly instead of silently dropping it.
        return NextResponse.json(
            { error: "Unknown step id." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
        // Existence check so the merge-set can't materialize a schema-invalid
        // partial user doc for a deleted/unprovisioned user.
        const snap = await userRef.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }
        await userRef.set(
            {
                seenTourSteps: FieldValue.arrayUnion(...stepIds),
                updatedAt: new Date().toISOString(),
            },
            { merge: true },
        );
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api/tour/seen] POST failed", error);
        return NextResponse.json(
            { error: "Failed to record tour progress." },
            { status: 500 },
        );
    }
}
