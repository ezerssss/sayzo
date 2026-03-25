import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { analyzeSession } from "@/services/analyzer";
import { buildSessionFromPlan, planNextSession } from "@/services/planner";
import { buildUserProfileFieldsFromOnboarding } from "@/services/profile-context-builder";
import { measureSessionExpression } from "@/services/hume-expression";
import { type SkillMemoryType } from "@/types/skill-memory";
import { type UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type CompleteOnboardingPayload = {
    uid: string;
    roleContext: string;
    goals: string[];
    goalsFreeText: string;
    painPoints: string[];
    painFreeText: string;
    introTranscript: string;
};

export async function POST(request: NextRequest) {
    const formData = await request.formData();
    const rawPayload = formData.get("payload");
    const audio = formData.get("audio");

    if (typeof rawPayload !== "string") {
        return NextResponse.json(
            { error: "Missing payload." },
            { status: 400 },
        );
    }
    if (!(audio instanceof File) || audio.size === 0) {
        return NextResponse.json(
            { error: "Missing or empty intro audio file." },
            { status: 400 },
        );
    }

    let payload: CompleteOnboardingPayload;
    try {
        payload = JSON.parse(rawPayload) as CompleteOnboardingPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid payload JSON." },
            { status: 400 },
        );
    }

    const uid = payload.uid?.trim();
    const introTranscript = payload.introTranscript?.trim();
    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }
    if (!introTranscript) {
        return NextResponse.json(
            { error: "Missing intro transcript." },
            { status: 400 },
        );
    }

    try {
        const audioBytes = new Uint8Array(await audio.arrayBuffer());
        const humeTrimmed = await measureSessionExpression({
            audio: audioBytes,
            transcript: introTranscript,
            filename: audio.name || "intro.webm",
            contentType: audio.type || "application/octet-stream",
        });

        const profileFields = await buildUserProfileFieldsFromOnboarding({
            role: payload.roleContext,
            industry: "",
            goals: payload.goals ?? [],
            goalsFreeText: payload.goalsFreeText,
            painPoints: payload.painPoints ?? [],
            painFreeText: payload.painFreeText,
            additionalContext: `Intro transcript:\n${introTranscript}\n\nVoice expression summary:\n${JSON.stringify(humeTrimmed)}`,
        });

        const nowIso = new Date().toISOString();
        const profile: UserProfileType = {
            uid,
            onboardingComplete: true,
            role: profileFields.role,
            industry: profileFields.industry,
            goals: profileFields.goals,
            additionalContext: profileFields.additionalContext,
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        const introAnalysis = await analyzeSession({
            userProfile: {
                role: profile.role,
                industry: profile.industry,
                goals: profile.goals,
                additionalContext: profile.additionalContext,
            },
            skillMemory: {
                strengths: [],
                weaknesses: [],
                recentFocus: [],
            },
            session: {
                plan: {
                    scenario: {
                        title: "Onboarding self-introduction",
                        situationContext: "",
                        givenContent: "",
                        task: "",
                    },
                    focus: payload.painPoints ?? [],
                },
                transcript: introTranscript,
                humeContext: JSON.stringify(humeTrimmed),
            },
        });

        const strengths = Array.from(
            new Set(
                introAnalysis.improvements
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
            ),
        );
        const weaknesses = Array.from(
            new Set(
                [
                    introAnalysis.mainIssue,
                    ...introAnalysis.secondaryIssues,
                    ...introAnalysis.regressions,
                ]
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
            ),
        );
        const skillMemory: SkillMemoryType = {
            uid,
            strengths,
            weaknesses,
            recentFocus: [],
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        const initialPlan = await planNextSession({
            userProfile: {
                role: profile.role,
                industry: profile.industry,
                goals: profile.goals,
                additionalContext: profile.additionalContext,
            },
            skillMemory: {
                strengths: skillMemory.strengths,
                weaknesses: skillMemory.weaknesses,
                recentFocus: skillMemory.recentFocus,
            },
        });
        const initialSession = buildSessionFromPlan(uid, initialPlan);

        const db = getAdminFirestore();
        const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
        const userExisting = await userRef.get();
        if (userExisting.exists) {
            await userRef.set(
                {
                    ...profile,
                    createdAt:
                        (userExisting.data()?.["createdAt"] as
                            | string
                            | undefined) ?? nowIso,
                },
                { merge: true },
            );
        } else {
            await userRef.set(profile);
        }

        const skillMemoryRef = db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid);
        const skillMemoryExisting = await skillMemoryRef.get();
        if (skillMemoryExisting.exists) {
            await skillMemoryRef.set(
                {
                    ...skillMemory,
                    createdAt:
                        (skillMemoryExisting.data()?.["createdAt"] as
                            | string
                            | undefined) ?? nowIso,
                },
                { merge: true },
            );
        } else {
            await skillMemoryRef.set(skillMemory);
        }

        const initialSessionRef = db
            .collection(FirestoreCollections.sessions.path)
            .doc(initialSession.id);
        await initialSessionRef.set(initialSession);

        return NextResponse.json({ ok: true });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to complete onboarding.",
            },
            { status: 500 },
        );
    }
}
