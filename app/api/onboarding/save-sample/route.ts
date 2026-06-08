import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { OnboardingSampleProgress } from "@/schemas";
import { NextResponse, type NextRequest } from "next/server";

type SaveSamplePayload = {
    sampleType: OnboardingSampleProgress["sampleType"];
    transcript: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    const body = (await request.json()) as SaveSamplePayload;

    const sampleType = body.sampleType;
    const validTypes = [
        "self_introduction",
        "workplace_scenario",
        "challenge_moment",
    ];
    if (!validTypes.includes(sampleType)) {
        return NextResponse.json(
            { error: "Invalid sample type." },
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
        const existing: OnboardingSampleProgress[] =
            (doc.data()?.onboardingSamples as OnboardingSampleProgress[]) ?? [];

        // Replace if this sample type already exists, otherwise append.
        const updated = existing.filter((s) => s.sampleType !== sampleType);
        updated.push({
            sampleType,
            transcript,
            completedAt: nowIso,
        });

        await userRef.set(
            {
                uid,
                onboardingComplete: false,
                onboardingSamples: updated,
                updatedAt: nowIso,
            },
            { merge: true },
        );

        return NextResponse.json({ ok: true, samplesSaved: updated.length });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to save sample.",
            },
            { status: 500 },
        );
    }
}
