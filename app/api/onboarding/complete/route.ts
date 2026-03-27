import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { analyzeSession } from "@/services/analyzer";
import { enrichCompanyContext } from "@/services/company-context-enricher";
import { buildSessionFromPlan, planNextSession } from "@/services/planner";
import { buildUserProfileFieldsFromOnboarding } from "@/services/profile-context-builder";
import { measureSessionExpression } from "@/services/hume-expression";
import { type SkillMemoryType } from "@/types/skill-memory";
import { type UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type CompleteOnboardingPayload = {
    uid: string;
    roleContext: string;
    employmentStatus: "employed" | "unemployed";
    wantsInterviewPractice: boolean;
    companyName: string;
    companyUrl: string;
    companyContext: string;
    workRoleContext: string;
    goals: string[];
    goalsFreeText: string;
    motivation: string;
    painPoints: string[];
    painFreeText: string;
    introTranscript: string;
};

export const runtime = "nodejs";

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
    const employmentStatus = payload.employmentStatus;
    const wantsInterviewPractice = payload.wantsInterviewPractice;
    const effectiveInterviewPractice =
        employmentStatus === "unemployed" || wantsInterviewPractice;
    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }
    if (employmentStatus !== "employed" && employmentStatus !== "unemployed") {
        return NextResponse.json(
            { error: "Invalid employment status." },
            { status: 400 },
        );
    }
    if (typeof wantsInterviewPractice !== "boolean") {
        return NextResponse.json(
            { error: "Invalid interview practice flag." },
            { status: 400 },
        );
    }
    if (!introTranscript) {
        return NextResponse.json(
            { error: "Missing intro transcript." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const nowIso = new Date().toISOString();
        await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .set(
                {
                    uid,
                    onboardingComplete: false,
                    onboardingStatus: "processing",
                    onboardingError: null,
                    onboardingJobUpdatedAt: nowIso,
                    updatedAt: nowIso,
                },
                { merge: true },
            );

        const audioBytes = new Uint8Array(await audio.arrayBuffer());
        let humeTrimmed = null;
        try {
            humeTrimmed = await measureSessionExpression({
                audio: audioBytes,
                transcript: introTranscript,
                filename: audio.name || "intro.webm",
                contentType: audio.type || "application/octet-stream",
            });
        } catch (error) {
            console.warn("Hume expression measurement failed, continuing.", error);
        }

        const profileFields = await buildUserProfileFieldsFromOnboarding({
            role: payload.roleContext,
            employmentStatus,
            companyName: payload.companyName,
            companyContext: `${payload.companyContext}\n${
                employmentStatus === "unemployed"
                    ? "Target interview role:"
                    : "Role at company:"
            }\n${payload.workRoleContext}`,
            goals: payload.goals ?? [],
            goalsFreeText: payload.goalsFreeText,
            motivation: payload.motivation,
            painPoints: payload.painPoints ?? [],
            painFreeText: payload.painFreeText,
            additionalContext: `Intro transcript:\n${introTranscript}\n\nVoice expression summary:\n${JSON.stringify(humeTrimmed)}`,
        });

        const profileNowIso = new Date().toISOString();
        const companyResearch = await enrichCompanyContext({
            companyName: profileFields.companyName,
            companyUrl: payload.companyUrl,
            companyContext: profileFields.workplaceCommunicationContext,
            role: profileFields.role,
            industry: profileFields.industry,
        });

        const profile: UserProfileType = {
            uid,
            onboardingComplete: true,
            onboardingStatus: "completed",
            onboardingError: null,
            onboardingJobUpdatedAt: profileNowIso,
            employmentStatus,
            wantsInterviewPractice: effectiveInterviewPractice,
            role: profileFields.role,
            industry:
                profileFields.industry || companyResearch?.guessedIndustry || "",
            goals: profileFields.goals,
            additionalContext: profileFields.additionalContext,
            companyName: profileFields.companyName,
            companyUrl: payload.companyUrl?.trim() || "",
            companyDescription:
                profileFields.companyDescription || companyResearch?.summary || "",
            workplaceCommunicationContext:
                profileFields.workplaceCommunicationContext,
            motivation: profileFields.motivation,
            companyResearch: companyResearch ?? undefined,
            createdAt: profileNowIso,
            updatedAt: profileNowIso,
        };

        const introAnalysis = await analyzeSession({
            userProfile: {
                role: profile.role,
                industry: profile.industry,
                companyName: profile.companyName,
                companyDescription: profile.companyDescription,
                workplaceCommunicationContext:
                    profile.workplaceCommunicationContext,
                wantsInterviewPractice: profile.wantsInterviewPractice,
                motivation: profile.motivation,
                goals: profile.goals,
                additionalContext: profile.additionalContext,
                companyResearch: profile.companyResearch,
            },
            skillMemory: {
                strengths: [],
                weaknesses: [],
                masteredFocus: [],
                reinforcementFocus: [],
            },
            session: {
                plan: {
                    scenario: {
                        title: "Onboarding self-introduction",
                        situationContext: "",
                        givenContent: "",
                        framework: "",
                    },
                    skillTarget: "Confident self-introduction",
                    maxDurationSeconds: 120,
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
            masteredFocus: [],
            reinforcementFocus: [],
            lastProcessedSessionId: null,
            createdAt: profileNowIso,
            updatedAt: profileNowIso,
        };

        const initialPlan = await planNextSession({
            userProfile: {
                role: profile.role,
                industry: profile.industry,
                companyName: profile.companyName,
                companyDescription: profile.companyDescription,
                workplaceCommunicationContext:
                    profile.workplaceCommunicationContext,
                wantsInterviewPractice: profile.wantsInterviewPractice,
                motivation: profile.motivation,
                goals: profile.goals,
                additionalContext: profile.additionalContext,
                companyResearch: profile.companyResearch,
            },
            skillMemory: {
                strengths: skillMemory.strengths,
                weaknesses: skillMemory.weaknesses,
                masteredFocus: skillMemory.masteredFocus,
                reinforcementFocus: skillMemory.reinforcementFocus,
            },
        });
        const initialSession = buildSessionFromPlan(uid, initialPlan);

        const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
        const userExisting = await userRef.get();
        if (userExisting.exists) {
            await userRef.set(
                {
                    ...profile,
                    createdAt:
                        (userExisting.data()?.["createdAt"] as
                            | string
                            | undefined) ?? profileNowIso,
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
                            | undefined) ?? profileNowIso,
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
        try {
            const db = getAdminFirestore();
            await db
                .collection(FirestoreCollections.users.path)
                .doc(uid)
                .set(
                    {
                        onboardingComplete: false,
                        onboardingStatus: "failed",
                        onboardingError:
                            error instanceof Error
                                ? error.message
                                : "Failed to complete onboarding.",
                        onboardingJobUpdatedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    { merge: true },
                );
        } catch (persistError) {
            console.error("Failed to persist onboarding processing error", persistError);
        }
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
