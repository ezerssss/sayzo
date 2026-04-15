import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    consumeCreditOrThrow,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import {
    getAdminFirestore,
} from "@/lib/firebase/admin";
import { planScenarioReplayFromCapture } from "@/services/capture-replay-planner";
import { buildSessionFromPlan } from "@/services/planner";
import type { CaptureType } from "@/types/captures";
import type { SessionType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

export const runtime = "nodejs";

type PracticePayload = { uid: string };

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: captureId } = await params;

    let payload: PracticePayload;
    try {
        payload = (await request.json()) as PracticePayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const uid = payload.uid?.trim();
    if (!uid) {
        return NextResponse.json(
            { error: "Missing uid." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();

        // 1. Load capture and verify ownership + status
        const captureSnap = await db
            .collection(FirestoreCollections.captures.path)
            .doc(captureId)
            .get();

        if (!captureSnap.exists) {
            return NextResponse.json(
                { error: "Capture not found." },
                { status: 404 },
            );
        }

        const capture = captureSnap.data() as CaptureType;

        if (capture.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to access this capture." },
                { status: 403 },
            );
        }

        if (capture.status !== "analyzed") {
            return NextResponse.json(
                {
                    error: `Cannot practice a conversation that is still ${capture.status}. Wait for analysis to complete.`,
                },
                { status: 400 },
            );
        }

        // 2. Check for existing practice session (dedup — don't create duplicates)
        const existingSnap = await db
            .collection(FirestoreCollections.sessions.path)
            .where("uid", "==", uid)
            .where("sourceCaptureId", "==", captureId)
            .where("type", "==", "scenario_replay")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

        if (!existingSnap.empty) {
            const existingId = (existingSnap.docs[0].data() as SessionType).id;
            return NextResponse.json(
                { sessionId: existingId },
                { status: 200 },
            );
        }

        // 3. Credit gate — only charge when we're actually creating a new practice session.
        try {
            await consumeCreditOrThrow(uid);
        } catch (err) {
            if (err instanceof CreditLimitReachedError) {
                return creditLimitResponse();
            }
            throw err;
        }

        // 4. Load user profile + skill memory in parallel
        const [userSnap, skillSnap] = await Promise.all([
            db.collection(FirestoreCollections.users.path).doc(uid).get(),
            db
                .collection(FirestoreCollections.skillMemories.path)
                .doc(uid)
                .get(),
        ]);

        const userProfile = userSnap.data() as UserProfileType | undefined;
        if (!userProfile) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }

        const skillData = (skillSnap.data() ?? {}) as Partial<SkillMemoryType>;

        // 4. Plan the replay drill
        const plan = await planScenarioReplayFromCapture({
            capture,
            userProfile: {
                role: userProfile.role,
                industry: userProfile.industry,
                companyName: userProfile.companyName ?? "",
                companyDescription: userProfile.companyDescription ?? "",
                workplaceCommunicationContext:
                    userProfile.workplaceCommunicationContext ?? "",
                motivation: userProfile.motivation ?? "",
                goals: Array.isArray(userProfile.goals)
                    ? userProfile.goals
                    : [],
                additionalContext: userProfile.additionalContext ?? "",
            },
            skillMemory: {
                strengths: Array.isArray(skillData.strengths)
                    ? (skillData.strengths as string[])
                    : [],
                weaknesses: Array.isArray(skillData.weaknesses)
                    ? (skillData.weaknesses as string[])
                    : [],
                masteredFocus: Array.isArray(skillData.masteredFocus)
                    ? (skillData.masteredFocus as string[])
                    : [],
                reinforcementFocus: Array.isArray(skillData.reinforcementFocus)
                    ? (skillData.reinforcementFocus as string[])
                    : [],
            },
        });

        // 5. Build the session with sourceCaptureId link
        const session = buildSessionFromPlan(uid, plan, {
            sourceCaptureId: captureId,
            type: "scenario_replay",
        });

        // 6. Insert into Firestore
        await db
            .collection(FirestoreCollections.sessions.path)
            .doc(session.id)
            .set(session);

        return NextResponse.json(
            { sessionId: session.id },
            { status: 201 },
        );
    } catch (error) {
        console.error(
            `[api/captures/${captureId}/practice] POST failed`,
            error,
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create practice session.",
            },
            { status: 500 },
        );
    }
}
