import { NextResponse, type NextRequest } from "next/server";

import {
    FirestoreCollections,
    reactionDocId,
    reactionSubmissionSchema,
    reactionTargetSchema,
} from "@/schemas";
import type { ItemReaction, ReactionSource, ReactionTarget } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { Firestore } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * Verify the caller owns the capture/session the reaction targets. Returns
 * `true`/`false` for owned/not-owned, or `null` when the item doesn't exist.
 * Mirrors the ownership check in /api/feedback-chat.
 */
async function ownsItem(
    db: Firestore,
    source: ReactionSource,
    itemId: string,
    uid: string,
): Promise<boolean | null> {
    const path =
        source === "capture"
            ? FirestoreCollections.captures.path
            : FirestoreCollections.sessions.path;
    const snap = await db.collection(path).doc(itemId).get();
    if (!snap.exists) return null;
    const data = snap.data() as { uid?: string };
    return data.uid === uid;
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = reactionSubmissionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid reaction payload" },
            { status: 400 },
        );
    }
    const { source, itemId, target, rating, reasonCode, reason } = parsed.data;

    try {
        const db = getAdminFirestore();
        const owned = await ownsItem(db, source, itemId, uid);
        if (owned === null) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (!owned) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const now = new Date().toISOString();
        const id = reactionDocId(source, itemId, uid, target);
        const ref = db
            .collection(FirestoreCollections.itemReactions.path)
            .doc(id);
        const existing = await ref.get();
        const createdAt = existing.exists
            ? (existing.data() as ItemReaction).createdAt
            : now;

        const doc: ItemReaction = {
            uid,
            source,
            itemId,
            target,
            rating,
            reasonCode,
            reason: reason && reason.length > 0 ? reason : null,
            createdAt,
            updatedAt: now,
        };
        await ref.set(doc);

        return NextResponse.json({ reaction: doc });
    } catch (error) {
        console.error("[api/reactions] POST failed", error);
        return NextResponse.json(
            { error: "Could not save reaction." },
            { status: 500 },
        );
    }
}

export async function GET(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    const params = new URL(request.url).searchParams;
    const source = params.get("source");
    const itemId = params.get("itemId");
    const target = reactionTargetSchema
        .catch("overall" as ReactionTarget)
        .parse(params.get("target") ?? "overall");

    if ((source !== "capture" && source !== "session") || !itemId) {
        return NextResponse.json(
            { error: "Missing or invalid source/itemId" },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const id = reactionDocId(source, itemId, uid, target);
        const snap = await db
            .collection(FirestoreCollections.itemReactions.path)
            .doc(id)
            .get();
        return NextResponse.json({
            reaction: snap.exists ? (snap.data() as ItemReaction) : null,
        });
    } catch (error) {
        console.error("[api/reactions] GET failed", error);
        return NextResponse.json(
            { error: "Could not load reaction." },
            { status: 500 },
        );
    }
}
