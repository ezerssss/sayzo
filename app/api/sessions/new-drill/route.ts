import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { buildSessionFromPlan, planNextSession } from "@/services/planner";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type NewDrillPayload = { uid: string };

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
        const skillMemoryData = skillDoc.data();
        const skillMemory: SkillMemoryType = skillMemoryData
            ? {
                  uid,
                  strengths: Array.isArray(skillMemoryData.strengths)
                      ? (skillMemoryData.strengths as string[])
                      : [],
                  weaknesses: Array.isArray(skillMemoryData.weaknesses)
                      ? (skillMemoryData.weaknesses as string[])
                      : [],
                  recentFocus: Array.isArray(skillMemoryData.recentFocus)
                      ? (skillMemoryData.recentFocus as string[])
                      : [],
                  createdAt:
                      typeof skillMemoryData.createdAt === "string"
                          ? skillMemoryData.createdAt
                          : new Date().toISOString(),
                  updatedAt:
                      typeof skillMemoryData.updatedAt === "string"
                          ? skillMemoryData.updatedAt
                          : new Date().toISOString(),
              }
            : {
                  uid,
                  strengths: [],
                  weaknesses: [],
                  recentFocus: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
              };

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

