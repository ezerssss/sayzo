import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { buildSessionFromPlan, planNextSession } from "@/services/planner";
import { updateSkillMemoryFromLatestSession } from "@/services/skill-memory-updater";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { SessionType } from "@/types/sessions";
import type { UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type NewDrillPayload = { uid: string };

function hydrateSkillMemory(
    uid: string,
    skillMemoryData: unknown,
): SkillMemoryType {
    const data = (skillMemoryData ?? {}) as Partial<SkillMemoryType>;
    const nowIso = new Date().toISOString();

    return {
        uid,
        strengths: Array.isArray(data.strengths) ? data.strengths : [],
        weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses : [],
        recentFocus: Array.isArray(data.recentFocus) ? data.recentFocus : [],
        createdAt: typeof data.createdAt === "string" ? data.createdAt : nowIso,
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso,
    };
}

async function refreshSkillMemoryFromLatestSession(
    db: ReturnType<typeof getAdminFirestore>,
    uid: string,
    current: SkillMemoryType,
): Promise<SkillMemoryType> {
    const latestSessionSnap = await db
        .collection(FirestoreCollections.sessions.path)
        .where("uid", "==", uid)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    if (latestSessionSnap.empty) return current;

    const latestSession = latestSessionSnap.docs[0]?.data() as
        | SessionType
        | undefined;
    const latestAnalysis = latestSession?.analysis;
    const latestFeedback = latestSession?.feedback;
    if (
        latestAnalysis == null ||
        typeof latestFeedback !== "string" ||
        latestFeedback.trim().length === 0
    ) {
        return current;
    }

    const updatedFields = await updateSkillMemoryFromLatestSession({
        skillMemory: {
            strengths: current.strengths,
            weaknesses: current.weaknesses,
            recentFocus: current.recentFocus,
        },
        latestSession: {
            analysis: latestAnalysis,
            feedback: latestFeedback,
        },
    });

    const updatedSkillMemory: SkillMemoryType = {
        ...current,
        ...updatedFields,
        updatedAt: new Date().toISOString(),
    };

    await db
        .collection(FirestoreCollections.skillMemories.path)
        .doc(uid)
        .set(updatedSkillMemory, { merge: true });

    return updatedSkillMemory;
}

export async function POST(request: NextRequest) {
    let payload: NewDrillPayload;
    try {
        payload = (await request.json()) as NewDrillPayload;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const uid = payload.uid?.trim();
    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }

    try {
        const db = getAdminFirestore();
        const userDoc = await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .get();
        if (!userDoc.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }

        const skillDoc = await db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid)
            .get();

        const userProfile = userDoc.data() as UserProfileType;
        const hydratedSkillMemory = hydrateSkillMemory(uid, skillDoc.data());
        const skillMemory = await refreshSkillMemoryFromLatestSession(
            db,
            uid,
            hydratedSkillMemory,
        );

        const plan = await planNextSession({
            userProfile: {
                role: userProfile.role,
                industry: userProfile.industry,
                goals: userProfile.goals,
                additionalContext: userProfile.additionalContext,
            },
            skillMemory: {
                strengths: skillMemory.strengths,
                weaknesses: skillMemory.weaknesses,
                recentFocus: skillMemory.recentFocus,
            },
        });

        const session = buildSessionFromPlan(uid, plan);
        await db
            .collection(FirestoreCollections.sessions.path)
            .doc(session.id)
            .set(session);

        return NextResponse.json({ session });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create new drill.",
            },
            { status: 500 },
        );
    }
}

