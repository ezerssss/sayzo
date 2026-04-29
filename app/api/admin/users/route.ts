import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
    getAdminFirestore,
    getFirebaseAdminApp,
} from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";

export const runtime = "nodejs";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

export async function GET(request: NextRequest) {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const cursor = url.searchParams.get("cursor")?.trim() ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "");
    const limit =
        Number.isFinite(limitParam) && limitParam > 0
            ? Math.min(limitParam, PAGE_SIZE_MAX)
            : PAGE_SIZE_DEFAULT;

    try {
        const db = getAdminFirestore();
        const adminAuth = getAuth(getFirebaseAdminApp());

        // Single-result lookups for q: try exact uid first, then exact email.
        if (q) {
            const matches = await lookupExact(q, adminAuth, db);
            return NextResponse.json({ users: matches, nextCursor: null });
        }

        let query = db
            .collection(FirestoreCollections.users.path)
            .orderBy("createdAt", "desc")
            .limit(limit);

        if (cursor) {
            const cursorSnap = await db
                .collection(FirestoreCollections.users.path)
                .doc(cursor)
                .get();
            if (cursorSnap.exists) {
                query = query.startAfter(cursorSnap);
            }
        }

        const snap = await query.get();
        const docs = snap.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Partial<UserProfileType>),
        }));
        const emails = await fetchEmails(adminAuth, docs.map((d) => d.uid));
        const users = docs.map((d) => ({
            ...d,
            email: emails.get(d.uid) ?? "",
        }));

        const nextCursor =
            snap.size === limit ? snap.docs[snap.size - 1]?.id ?? null : null;

        return NextResponse.json({ users, nextCursor });
    } catch (error) {
        console.error("[api/admin/users] GET failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to list users.",
            },
            { status: 500 },
        );
    }
}

async function lookupExact(
    q: string,
    adminAuth: ReturnType<typeof getAuth>,
    db: ReturnType<typeof getAdminFirestore>,
): Promise<Array<Partial<UserProfileType> & { uid: string; email: string }>> {
    // Try uid first.
    const uidSnap = await db
        .collection(FirestoreCollections.users.path)
        .doc(q)
        .get();
    if (uidSnap.exists) {
        const email = await adminAuth
            .getUser(q)
            .then((u) => u.email ?? "")
            .catch(() => "");
        return [
            {
                uid: q,
                email,
                ...(uidSnap.data() as Partial<UserProfileType>),
            },
        ];
    }

    // Try exact email.
    if (q.includes("@")) {
        try {
            const authUser = await adminAuth.getUserByEmail(q);
            const profileSnap = await db
                .collection(FirestoreCollections.users.path)
                .doc(authUser.uid)
                .get();
            return [
                {
                    uid: authUser.uid,
                    email: authUser.email ?? "",
                    ...(profileSnap.exists
                        ? (profileSnap.data() as Partial<UserProfileType>)
                        : {}),
                },
            ];
        } catch {
            return [];
        }
    }

    return [];
}

async function fetchEmails(
    adminAuth: ReturnType<typeof getAuth>,
    uids: string[],
): Promise<Map<string, string>> {
    if (uids.length === 0) return new Map();
    try {
        const result = await adminAuth.getUsers(uids.map((uid) => ({ uid })));
        const map = new Map<string, string>();
        for (const u of result.users) {
            map.set(u.uid, u.email ?? "");
        }
        return map;
    } catch (error) {
        console.warn("[api/admin/users] getUsers email fetch failed", error);
        return new Map();
    }
}
