import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { OnboardingDrillProgress } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type SaveDrillPayload = {
    drillType: OnboardingDrillProgress["drillType"];
    transcript: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    const body = (await request.json()) as SaveDrillPayload;

    const drillType = body.drillType;
    const validTypes = [
        "self_introduction",
        "workplace_scenario",
        "challenge_moment",
    ];
    if (!validTypes.includes(drillType)) {
        return NextResponse.json(
            { error: "Invalid drill type." },
            { status: 400 },
        );
    }

    const transcript = body.transcript?.trim();
    if (!transcript) {
        return NextResponse.json(
            { error: "Missing transcript." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const userRef = db
            .collection(FirestoreCollections.users.path)
            .doc(uid);
        const nowIso = new Date().toISOString();

        const doc = await userRef.get();
        const existing: OnboardingDrillProgress[] =
            (doc.data()?.onboardingDrills as OnboardingDrillProgress[]) ?? [];

        // Replace if this drill type already exists, otherwise append
        const updated = existing.filter((d) => d.drillType !== drillType);
        updated.push({
            drillType,
            transcript,
            completedAt: nowIso,
        });

        await userRef.set(
            {
                uid,
                onboardingComplete: false,
                onboardingDrills: updated,
                updatedAt: nowIso,
            },
            { merge: true },
        );

        return NextResponse.json({ ok: true, drillsSaved: updated.length });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to save drill.",
            },
            { status: 500 },
        );
    }
}
