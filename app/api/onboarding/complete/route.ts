import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { analyzeSession } from "@/services/analyzer";
import { enrichCompanyContext } from "@/services/company-context-enricher";
import { buildSessionFromPlan, planNextSession } from "@/services/planner";
import {
    type OnboardingDrillTranscript,
    type UserProfileFieldsFromAI,
} from "@/services/profile-context-builder";
import { measureSessionExpression } from "@/services/hume-expression";
import { type SkillMemoryType } from "@/types/skill-memory";
import { type UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type CompleteOnboardingPayload = {
    uid: string;
    drills: OnboardingDrillTranscript[];
    /** User-reviewed and possibly edited profile fields from the review step. */
    profileOverrides?: UserProfileFieldsFromAI;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const formData = await request.formData();
    const rawPayload = formData.get("payload");

    if (typeof rawPayload !== "string") {
        return NextResponse.json(
            { error: "Missing payload." },
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
    if (!uid) {
        return NextResponse.json({ error: "Missing uid." }, { status: 400 });
    }

    const drills = payload.drills;
    if (!Array.isArray(drills) || drills.length === 0) {
        return NextResponse.json(
            { error: "Missing drill transcripts." },
            { status: 400 },
        );
    }

    // Combine all transcripts for baseline analysis
    const combinedTranscript = drills
        .map((d) => d.transcript.trim())
        .filter((t) => t.length > 0)
        .join("\n\n");

    if (!combinedTranscript) {
        return NextResponse.json(
            { error: "All drill transcripts are empty." },
            { status: 400 },
        );
    }

    // Get the self-introduction audio for Hume expression analysis
    const introAudio = formData.get("audio_self_introduction");

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

        // Hume expression analysis on the intro audio
        let humeTrimmed = null;
        if (introAudio instanceof File && introAudio.size > 0) {
            const introTranscript =
                drills.find((d) => d.drillType === "self_introduction")
                    ?.transcript ?? "";
            try {
                const audioBytes = new Uint8Array(
                    await introAudio.arrayBuffer(),
                );
                humeTrimmed = await measureSessionExpression({
                    audio: audioBytes,
                    transcript: introTranscript,
                    filename: introAudio.name || "intro.webm",
                    contentType:
                        introAudio.type || "application/octet-stream",
                });
            } catch (error) {
                console.warn(
                    "Hume expression measurement failed, continuing.",
                    error,
                );
            }
        }

        // Use user-reviewed profile overrides (already extracted in the review step)
        const profileFields = payload.profileOverrides;
        if (!profileFields) {
            throw new Error("Missing profile fields from review step.");
        }

        const profileNowIso = new Date().toISOString();
        const companyResearch = profileFields.companyName
            ? await enrichCompanyContext({
                  companyName: profileFields.companyName,
                  companyUrl: "",
                  companyContext:
                      profileFields.workplaceCommunicationContext,
                  role: profileFields.role,
                  industry: profileFields.industry,
              })
            : null;

        const profile: UserProfileType = {
            uid,
            onboardingComplete: true,
            onboardingStatus: "completed",
            onboardingError: null,
            onboardingJobUpdatedAt: profileNowIso,
            employmentStatus: profileFields.employmentStatus,
            wantsInterviewPractice: profileFields.wantsInterviewPractice,
            role: profileFields.role,
            industry:
                profileFields.industry ||
                companyResearch?.guessedIndustry ||
                "",
            goals: profileFields.goals,
            additionalContext: profileFields.additionalContext,
            companyName: profileFields.companyName,
            companyUrl: "",
            companyDescription:
                profileFields.companyDescription ||
                companyResearch?.summary ||
                "",
            workplaceCommunicationContext:
                profileFields.workplaceCommunicationContext,
            motivation: profileFields.motivation,
            companyResearch: companyResearch ?? null,
            internalLearnerContext: "",
            lastInternalLearnerContextSessionId: "",
            internalDrillSignalNotes: "",
            lastDrillSignalNotesSessionId: "",
            createdAt: profileNowIso,
            updatedAt: profileNowIso,
        };

        // Analyze the combined transcript as a baseline
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
                        title: "Onboarding speaking drills",
                        situationContext:
                            "Three onboarding drills: self-introduction, workplace scenario, and challenge moment.",
                        givenContent: "",
                        framework: "",
                        category: "self_introduction",
                    },
                    skillTarget: "Baseline communication assessment",
                    maxDurationSeconds: 240,
                },
                transcript: combinedTranscript,
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
                internalLearnerContext: profile.internalLearnerContext,
                internalDrillSignalNotes: profile.internalDrillSignalNotes,
            },
            skillMemory: {
                strengths: skillMemory.strengths,
                weaknesses: skillMemory.weaknesses,
                masteredFocus: skillMemory.masteredFocus,
                reinforcementFocus: skillMemory.reinforcementFocus,
            },
            recentDrills: [],
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
            console.error(
                "Failed to persist onboarding processing error",
                persistError,
            );
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
