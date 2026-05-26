import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { analyzeSession } from "@/services/analyzer";
import { enrichCompanyContext } from "@/services/company-context-enricher";
import { pregenerateNextDrillFor } from "@/services/drill-pre-generator";
import {
    buildUserProfileFieldsFromDrills,
    type OnboardingDrillTranscript,
    type UserProfileFieldsFromAI,
} from "@/services/profile-context-builder";
import { createEmptyLearnerModel } from "@/schemas";
import {
    hydrateLearnerModel,
    learnerModelDoc,
} from "@/lib/learner-model/store";
import { type UserProfileType } from "@/schemas";
import { NextResponse, type NextRequest } from "next/server";

type CompleteOnboardingPayload = {
    drills: OnboardingDrillTranscript[];
};

export const runtime = "nodejs";

function emptyProfileFields(): UserProfileFieldsFromAI {
    return {
        role: "",
        industry: "",
        goals: [],
        companyName: "",
        companyDescription: "",
        workplaceCommunicationContext: "",
        motivation: "",
        additionalContext: "",
        employmentStatus: "employed",
        wantsInterviewPractice: false,
    };
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

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

    const drills = Array.isArray(payload.drills) ? payload.drills : [];

    const combinedTranscript = drills
        .map((d) => d.transcript.trim())
        .filter((t) => t.length > 0)
        .join("\n\n");
    const hasAnyTranscript = combinedTranscript.length > 0;

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

        const profileFields = hasAnyTranscript
            ? await buildUserProfileFieldsFromDrills({ drills })
            : emptyProfileFields();

        const profileNowIso = new Date().toISOString();
        let companyResearch = null;
        if (profileFields.companyName) {
            try {
                companyResearch = await enrichCompanyContext({
                    companyName: profileFields.companyName,
                    companyUrl: "",
                    companyContext:
                        profileFields.workplaceCommunicationContext,
                    role: profileFields.role,
                    industry: profileFields.industry,
                });
            } catch (error) {
                console.warn(
                    "Company context enrichment failed, continuing without it.",
                    error,
                );
            }
        }

        // Stay in "processing" until pregen writes the pending drill — the
        // AppShell redirect from /app/onboarding → /app fires on these flags.
        const profile: UserProfileType = {
            uid,
            onboardingComplete: false,
            onboardingStatus: "processing",
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
            firstDrillCompletedAt: null,
            createdAt: profileNowIso,
            updatedAt: profileNowIso,
        };

        let strengths: string[] = [];
        let weaknesses: string[] = [];

        if (hasAnyTranscript) {
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
                // Onboarding is the baseline — no history to be differential against.
                differential: { trackedPatterns: [], recentMainIssues: [] },
                session: {
                    plan: {
                        scenario: {
                            title: "Onboarding speaking drills",
                            question:
                                "Introduce yourself, describe a typical day at work, and share what you most want to improve.",
                            category: "self_introduction",
                        },
                        skillTarget: "Baseline communication assessment",
                        maxDurationSeconds: 240,
                    },
                    transcript: combinedTranscript,
                },
            });

            strengths = Array.from(
                new Set(
                    introAnalysis.improvements
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0),
                ),
            );
            weaknesses = Array.from(
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
        }

        // Seed the learner model with the onboarding-derived strengths/weaknesses.
        const learnerModel = {
            ...createEmptyLearnerModel(uid, profileNowIso),
            strengths,
            weaknesses,
        };

        const userRef = db.collection(FirestoreCollections.users.path).doc(uid);
        const userExisting = await userRef.get();
        if (userExisting.exists) {
            const existingData = userExisting.data();
            await userRef.set(
                {
                    ...profile,
                    createdAt:
                        (existingData?.["createdAt"] as string | undefined) ??
                        profileNowIso,
                    // A desktop-first user can complete a drill before running
                    // the optional questionnaire; `profile` hardcodes null,
                    // which would otherwise reset the install-nudge cadence.
                    firstDrillCompletedAt:
                        (existingData?.["firstDrillCompletedAt"] as
                            | string
                            | null
                            | undefined) ?? null,
                },
                { merge: true },
            );
        } else {
            await userRef.set(profile);
        }

        const learnerModelRef = learnerModelDoc(db, uid);
        const existingModel = await learnerModelRef.get();
        if (existingModel.exists) {
            // A desktop-first user can accumulate real coaching state
            // (strengths, weaknesses, focus, trackedPatterns, cursors) from
            // captures/drills BEFORE running the optional questionnaire. Don't
            // wipe it: merge onboarding-derived signals in additively and leave
            // focus/cursors alone. Only seed the baseline when the model is
            // still empty (freshly provisioned). Prose context is preserved by
            // the merge either way.
            const existing = hydrateLearnerModel(uid, existingModel.data());
            // Any signal that captures/drills already wrote real coaching state.
            // `lastCaptureContextCaptureId` is the definitive capture-merge
            // marker (set on every capture); the rest cover partial writes.
            const hasAccumulatedState =
                existing.trackedPatterns.length > 0 ||
                existing.strengths.length > 0 ||
                existing.weaknesses.length > 0 ||
                existing.masteredFocus.length > 0 ||
                existing.reinforcementFocus.length > 0 ||
                existing.lastProcessedSessionId !== null ||
                existing.lastCaptureContextCaptureId !== "";
            await learnerModelRef.set(
                hasAccumulatedState
                    ? {
                          strengths: Array.from(
                              new Set([...existing.strengths, ...strengths]),
                          ),
                          weaknesses: Array.from(
                              new Set([...existing.weaknesses, ...weaknesses]),
                          ),
                          updatedAt: profileNowIso,
                      }
                    : {
                          strengths,
                          weaknesses,
                          updatedAt: profileNowIso,
                      },
                { merge: true },
            );
        } else {
            await learnerModelRef.set(learnerModel);
        }

        // Pre-generate the user's first drill so the home page lands on
        // "Today's drill is ready" instead of an empty state. Uses the same
        // pre-generator as `/api/sessions/complete` so the priority order
        // (capture-derived → regular planner) and 60s constraint are
        // consistent. Force-fresh because the user has no pending drill yet.
        const preGen = await pregenerateNextDrillFor(uid, {
            forceFresh: true,
            // Pre-gen runs while onboardingComplete is still false (we flip it
            // only after the pending drill is written), so bypass the gate.
            allowUnonboarded: true,
        });
        if (!preGen.ok && preGen.reason === "error") {
            console.error(
                "[onboarding/complete] initial drill pre-generation failed",
                preGen.message,
            );
        }

        const completionIso = new Date().toISOString();
        await userRef.set(
            {
                onboardingComplete: true,
                onboardingStatus: "completed",
                onboardingError: null,
                onboardingJobUpdatedAt: completionIso,
                updatedAt: completionIso,
            },
            { merge: true },
        );

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
