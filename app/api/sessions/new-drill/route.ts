import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import {
    consumeCreditOrThrow,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    enrichCompanyContext,
    isCompanyResearchStale,
} from "@/services/company-context-enricher";
import {
    buildSessionFromPlan,
    planNextSession,
    PLANNER_RECENT_DRILLS_LOOKBACK,
    summarizeSessionsForPlanner,
} from "@/services/planner";
import { updateSkillMemoryFromLatestSession } from "@/services/skill-memory-updater";
import type { SkillMemoryType } from "@/types/skill-memory";
import {
    hasSessionFeedbackContent,
    type SessionType,
} from "@/types/sessions";
import type { UserProfileType } from "@/types/user";
import { NextResponse, type NextRequest } from "next/server";

type NewDrillPayload = { uid: string; category?: string };

export const runtime = "nodejs";

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
        masteredFocus: Array.isArray(data.masteredFocus) ? data.masteredFocus : [],
        reinforcementFocus: Array.isArray(data.reinforcementFocus)
            ? data.reinforcementFocus
            : [],
        lastProcessedSessionId:
            typeof data.lastProcessedSessionId === "string"
                ? data.lastProcessedSessionId
                : null,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : nowIso,
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : nowIso,
    };
}

async function refreshSkillMemoryFromLatestSession(
    db: ReturnType<typeof getAdminFirestore>,
    uid: string,
    current: SkillMemoryType,
    preloadedLatestSession?: SessionType,
): Promise<SkillMemoryType> {
    let latestSession = preloadedLatestSession;
    if (latestSession == null) {
        const latestSessionSnap = await db
            .collection(FirestoreCollections.sessions.path)
            .where("uid", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
        if (latestSessionSnap.empty) return current;
        latestSession = latestSessionSnap.docs[0]?.data() as SessionType;
    }
    if (!latestSession?.id) {
        return current;
    }
    if (current.lastProcessedSessionId === latestSession.id) {
        return current;
    }
    const latestAnalysis = latestSession?.analysis;
    const latestFeedback = latestSession?.feedback;
    if (latestAnalysis == null || latestFeedback == null) {
        return current;
    }
    if (!hasSessionFeedbackContent(latestFeedback)) {
        return current;
    }

    const updatedFields = await updateSkillMemoryFromLatestSession({
        skillMemory: {
            strengths: current.strengths,
            weaknesses: current.weaknesses,
            masteredFocus: current.masteredFocus,
            reinforcementFocus: current.reinforcementFocus,
        },
        latestSession: {
            completionStatus: latestSession?.completionStatus,
            completionReason: latestSession?.completionReason ?? null,
            analysis: latestAnalysis,
            feedback: latestFeedback,
            skillTarget: latestSession?.plan?.skillTarget ?? "",
            framework: latestSession?.plan?.scenario?.framework ?? "",
        },
    });

    const updatedSkillMemory: SkillMemoryType = {
        ...current,
        ...updatedFields,
        lastProcessedSessionId: latestSession.id,
        updatedAt: new Date().toISOString(),
    };

    await db
        .collection(FirestoreCollections.skillMemories.path)
        .doc(uid)
        .set(updatedSkillMemory, { merge: true });

    return updatedSkillMemory;
}

async function refreshCompanyResearchIfNeeded(
    db: ReturnType<typeof getAdminFirestore>,
    uid: string,
    profile: UserProfileType,
): Promise<UserProfileType> {
    const companyName = profile.companyName?.trim();
    if (!companyName) return profile;
    if (!isCompanyResearchStale(profile.companyResearch)) return profile;

    const enrichment = await enrichCompanyContext({
        companyName,
        companyUrl: profile.companyUrl,
        companyContext: profile.workplaceCommunicationContext,
        role: profile.role,
        industry: profile.industry,
    });
    if (enrichment == null) return profile;

    const updatedProfile: UserProfileType = {
        ...profile,
        industry: profile.industry || enrichment.guessedIndustry,
        companyDescription: profile.companyDescription || enrichment.summary,
        companyResearch: enrichment,
        updatedAt: new Date().toISOString(),
    };

    await db
        .collection(FirestoreCollections.users.path)
        .doc(uid)
        .set(
            {
                industry: updatedProfile.industry,
                companyDescription: updatedProfile.companyDescription,
                companyResearch: updatedProfile.companyResearch,
                updatedAt: updatedProfile.updatedAt,
            },
            { merge: true },
        );

    return updatedProfile;
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
    const requestedCategory = payload.category?.trim() || undefined;

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

        try {
            await consumeCreditOrThrow(uid);
        } catch (err) {
            if (err instanceof CreditLimitReachedError) {
                return creditLimitResponse();
            }
            throw err;
        }

        const skillDoc = await db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid)
            .get();

        const userProfile = userDoc.data() as UserProfileType;
        const enrichedUserProfile = await refreshCompanyResearchIfNeeded(
            db,
            uid,
            userProfile,
        );

        const recentSessionsSnap = await db
            .collection(FirestoreCollections.sessions.path)
            .where("uid", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(PLANNER_RECENT_DRILLS_LOOKBACK)
            .get();
        const recentSessions = recentSessionsSnap.docs.map(
            (docSnap) => docSnap.data() as SessionType,
        );
        const latestSession = recentSessions[0];
        // Skip conversation practice sessions for guard checks — they
        // shouldn't block creating regular drills.
        const latestRegularSession = recentSessions.find(
            (s) => s.type !== "scenario_replay",
        );
        if (
            latestRegularSession?.completionStatus === "needs_retry" &&
            latestRegularSession?.processingStatus !== "processing"
        ) {
            return NextResponse.json(
                {
                    error:
                        latestRegularSession.completionReason?.trim() ||
                        "Please redo your current drill before creating a new one.",
                    code: "DRILL_RETRY_REQUIRED",
                },
                { status: 409 },
            );
        }

        if (latestRegularSession?.processingStatus === "processing") {
            return NextResponse.json(
                {
                    error:
                        "Your last drill is still processing. Wait for it to finish.",
                    code: "DRILL_STILL_PROCESSING",
                },
                { status: 409 },
            );
        }

        const hydratedSkillMemory = hydrateSkillMemory(uid, skillDoc.data());
        const skillMemory = await refreshSkillMemoryFromLatestSession(
            db,
            uid,
            hydratedSkillMemory,
            latestSession,
        );

        const recentDrills = summarizeSessionsForPlanner(recentSessions);

        const plan = await planNextSession({
            userProfile: {
                role: enrichedUserProfile.role,
                industry: enrichedUserProfile.industry,
                companyName: enrichedUserProfile.companyName ?? "",
                companyDescription: enrichedUserProfile.companyDescription ?? "",
                workplaceCommunicationContext:
                    enrichedUserProfile.workplaceCommunicationContext ?? "",
                wantsInterviewPractice:
                    enrichedUserProfile.wantsInterviewPractice ?? false,
                motivation: enrichedUserProfile.motivation ?? "",
                goals: enrichedUserProfile.goals,
                additionalContext: enrichedUserProfile.additionalContext,
                companyResearch: enrichedUserProfile.companyResearch,
                internalLearnerContext: enrichedUserProfile.internalLearnerContext,
                internalDrillSignalNotes:
                    enrichedUserProfile.internalDrillSignalNotes?.trim() ?? "",
                internalCaptureContext:
                    enrichedUserProfile.internalCaptureContext?.trim() ?? "",
                internalCaptureDeliveryNotes:
                    enrichedUserProfile.internalCaptureDeliveryNotes?.trim() ??
                    "",
            },
            skillMemory: {
                strengths: skillMemory.strengths,
                weaknesses: skillMemory.weaknesses,
                masteredFocus: skillMemory.masteredFocus,
                reinforcementFocus: skillMemory.reinforcementFocus,
            },
            recentDrills,
            requestedCategory,
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

