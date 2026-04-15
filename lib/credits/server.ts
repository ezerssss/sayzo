import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { DEFAULT_FREE_CREDIT_LIMIT } from "@/constants/credits";
import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { UserProfileType } from "@/types/user";

export class CreditLimitReachedError extends Error {
    readonly code = "credit_limit_reached" as const;
    constructor() {
        super("Free credit limit reached");
        this.name = "CreditLimitReachedError";
    }
}

/**
 * Atomically check-and-increment a user's credit counter. Throws CreditLimitReachedError
 * when the user is out of free credits AND doesn't have full access. No-ops when hasFullAccess.
 *
 * Use at the entry of endpoints that START a chargeable unit of work
 * (drill creation, capture upload, capture replay creation).
 */
export async function consumeCreditOrThrow(uid: string): Promise<void> {
    if (!uid) throw new CreditLimitReachedError();
    const db = getAdminFirestore();
    const userRef = db.collection(FirestoreCollections.users.path).doc(uid);

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const data = (snap.data() ?? {}) as Partial<UserProfileType>;
        if (data.hasFullAccess === true) return;
        const limit = data.creditsLimit ?? DEFAULT_FREE_CREDIT_LIMIT;
        const used = data.creditsUsed ?? 0;
        if (used >= limit) throw new CreditLimitReachedError();
        tx.update(userRef, {
            creditsUsed: FieldValue.increment(1),
            updatedAt: new Date().toISOString(),
        });
    });
}

/**
 * Read-only gate for endpoints that don't start a new charged unit but still cost money.
 * Throws when the user is at or above their limit AND doesn't have full access.
 */
export async function assertHasCredit(uid: string): Promise<void> {
    if (!uid) throw new CreditLimitReachedError();
    const db = getAdminFirestore();
    const snap = await db
        .collection(FirestoreCollections.users.path)
        .doc(uid)
        .get();
    const data = (snap.data() ?? {}) as Partial<UserProfileType>;
    if (data.hasFullAccess === true) return;
    const limit = data.creditsLimit ?? DEFAULT_FREE_CREDIT_LIMIT;
    const used = data.creditsUsed ?? 0;
    if (used >= limit) throw new CreditLimitReachedError();
}

export function creditLimitResponse(): NextResponse {
    return NextResponse.json(
        {
            error: "credit_limit_reached",
            message:
                "You've used all your free Sayzo actions. Request full access to keep going.",
        },
        { status: 402 },
    );
}
