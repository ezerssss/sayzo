import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getFirebaseAdminApp, getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

type AccessRequestPayload = { note?: string };

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid, email: authedEmail } = auth;

    let payload: AccessRequestPayload;
    try {
        payload = (await request.json()) as AccessRequestPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const note =
        typeof payload.note === "string" ? payload.note.trim().slice(0, 2000) : "";

    try {
        const db = getAdminFirestore();
        const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }
        const profile = userSnap.data() as UserProfileType;

        // One access request per user, forever. Admin will either grant (flip
        // hasFullAccess) or deny out-of-band; re-requests aren't useful.
        if (profile.accessRequestedAt) {
            return NextResponse.json({ alreadyRequested: true });
        }

        let email = authedEmail;
        if (!email) {
            try {
                const authRecord = await getAuth(getFirebaseAdminApp()).getUser(uid);
                email = authRecord.email ?? "";
            } catch {
                // continue without email
            }
        }

        const nowIso = new Date().toISOString();

        await db
            .collection(FirestoreCollections.accessRequests.path)
            .add({
                uid,
                email,
                note,
                createdAt: nowIso,
                status: "pending",
            });

        await userRef.set(
            {
                accessRequestedAt: nowIso,
                accessRequestNote: note,
                updatedAt: nowIso,
            },
            { merge: true },
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("[api/access-requests] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to submit access request.",
            },
            { status: 500 },
        );
    }
}
