import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteUserCompletely } from "@/lib/admin/cascade-delete";
import {
    getAdminFirestore,
    getFirebaseAdminApp,
} from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserFocusInsights } from "@/types/focus-insights";

export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> },
) {
    const { uid } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const db = getAdminFirestore();
        const adminAuth = getAuth(getFirebaseAdminApp());

        const [profileSnap, skillSnap, focusSnap, sessionsCountSnap, capturesCountSnap] =
            await Promise.all([
                db
                    .collection(FirestoreCollections.users.path)
                    .doc(uid)
                    .get(),
                db
                    .collection(FirestoreCollections.skillMemories.path)
                    .doc(uid)
                    .get(),
                db
                    .collection(FirestoreCollections.userFocusInsights.path)
                    .doc(uid)
                    .get(),
                db
                    .collection(FirestoreCollections.sessions.path)
                    .where("uid", "==", uid)
                    .count()
                    .get(),
                db
                    .collection(FirestoreCollections.captures.path)
                    .where("uid", "==", uid)
                    .count()
                    .get(),
            ]);

        let authRecord: { email: string; disabled: boolean; createdAt: string } | null =
            null;
        try {
            const u = await adminAuth.getUser(uid);
            authRecord = {
                email: u.email ?? "",
                disabled: u.disabled,
                createdAt: u.metadata.creationTime,
            };
        } catch {
            authRecord = null;
        }

        return NextResponse.json({
            uid,
            authRecord,
            profile: profileSnap.exists
                ? (profileSnap.data() as UserProfileType)
                : null,
            skillMemory: skillSnap.exists
                ? (skillSnap.data() as SkillMemoryType)
                : null,
            focusInsights: focusSnap.exists
                ? (focusSnap.data() as UserFocusInsights)
                : null,
            counts: {
                sessions: sessionsCountSnap.data().count,
                captures: capturesCountSnap.data().count,
            },
        });
    } catch (error) {
        console.error(`[api/admin/users/${uid}] GET failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to load user.",
            },
            { status: 500 },
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> },
) {
    const { uid } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    if (uid === auth.uid) {
        return NextResponse.json(
            { error: "Refusing to delete your own admin account." },
            { status: 400 },
        );
    }

    try {
        const result = await deleteUserCompletely(uid, auth);
        return NextResponse.json({ ok: true, result });
    } catch (error) {
        console.error(`[api/admin/users/${uid}] DELETE failed`, error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to delete user.",
            },
            { status: 500 },
        );
    }
}
