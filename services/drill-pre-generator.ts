import "server-only";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { isStaleProcessing } from "@/constants/session-processing";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    enrichCompanyContext,
    isCompanyResearchStale,
} from "@/services/company-context-enricher";
import { planScenarioReplayFromCapture } from "@/services/capture-replay-planner";
import {
    buildSessionFromPlan,
    planNextSession,
    PLANNER_RECENT_DRILLS_LOOKBACK,
    summarizeSessionsForPlanner,
} from "@/services/planner";
import { updateSkillMemoryFromLatestSession } from "@/services/skill-memory-updater";
import type { CaptureType } from "@/types/captures";
import type { SkillMemoryType } from "@/types/skill-memory";
import {
    hasSessionFeedbackContent,
    type SessionType,
} from "@/types/sessions";
import type { UserProfileType } from "@/types/user";

/** Captures within this window are eligible for capture-derived drills. */
const FRESH_CAPTURE_DAYS = 7;
const FRESH_CAPTURE_MS = FRESH_CAPTURE_DAYS * 24 * 60 * 60 * 1000;

export type PregenerateOptions = {
    /** When set, the planner MUST use this category. Implies forceFresh = true. */
    requestedCategory?: string;
    /**
     * Force a fresh generation even if a pending drill already exists. Used by
     * user-initiated "different drill" actions and by the explicit
     * `POST /api/sessions/new-drill` endpoint. The previous pending drill, if
     * any, is marked `skipped` so only one pending drill is ever surfaced.
     */
    forceFresh?: boolean;
    /** Skip the capture-derived priority and use the regular planner directly. */
    skipCaptureDerived?: boolean;
};

export type PregenerateOutcome =
    /** New drill was created and persisted. */
    | { ok: true; session: SessionType; created: true }
    /** A pending drill already existed; nothing was created. Returned only when forceFresh is false. */
    | { ok: true; session: SessionType; created: false }
    /** Latest regular drill is in `needs_retry` state. The user must redo it before a new one is created. */
    | { ok: false; reason: "needs_retry"; session: SessionType }
    /** Latest regular drill is still processing. Caller may show a "still processing" message. */
    | { ok: false; reason: "still_processing"; session: SessionType }
    | { ok: false; reason: "no_user" }
    | { ok: false; reason: "error"; message: string };

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
        masteredFocus: Array.isArray(data.masteredFocus)
            ? data.masteredFocus
            : [],
        reinforcementFocus: Array.isArray(data.reinforcementFocus)
            ? data.reinforcementFocus
            : [],
        lastProcessedSessionId:
            typeof data.lastProcessedSessionId === "string"
                ? data.lastProcessedSessionId
                : null,
        createdAt:
            typeof data.createdAt === "string" ? data.createdAt : nowIso,
        updatedAt:
            typeof data.updatedAt === "string" ? data.updatedAt : nowIso,
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
    if (!latestSession?.id) return current;
    if (current.lastProcessedSessionId === latestSession.id) return current;
    const latestAnalysis = latestSession?.analysis;
    const latestFeedback = latestSession?.feedback;
    if (latestAnalysis == null || latestFeedback == null) return current;
    if (!hasSessionFeedbackContent(latestFeedback)) return current;

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

/**
 * Look for a fresh-and-unpracticed capture. Returns a built `SessionType`
 * with `type: "scenario_replay"` if one is found, otherwise null. Callers
 * persist the returned session.
 *
 * Firestore index notes: this query reads `captures` filtered by
 * `uid + status + startedAt`. The `captures(uid, startedAt desc)` index
 * already exists for the captures dashboard; adding a `status` filter on
 * top is cheap and Firestore can typically resolve it with the existing
 * compound index by post-filtering the small status set. If a "missing
 * index" warning shows up at runtime, add a compound index on
 * `captures(uid asc, status asc, startedAt desc)`.
 */
async function tryCaptureDerivedDrill(
    db: ReturnType<typeof getAdminFirestore>,
    uid: string,
    userProfile: UserProfileType,
    skillMemory: SkillMemoryType,
    recentSessions: SessionType[],
): Promise<SessionType | null> {
    const cutoff = new Date(Date.now() - FRESH_CAPTURE_MS).toISOString();

    const capturesSnap = await db
        .collection(FirestoreCollections.captures.path)
        .where("uid", "==", uid)
        .where("status", "==", "analyzed")
        .where("startedAt", ">", cutoff)
        .orderBy("startedAt", "desc")
        .limit(5)
        .get();

    if (capturesSnap.empty) return null;

    // Dedup against existing replay sessions (any status — once a capture has
    // been replayed once, don't auto-pick it again).
    const replayedCaptureIds = new Set(
        recentSessions
            .filter((s) => s.type === "scenario_replay" && s.sourceCaptureId)
            .map((s) => s.sourceCaptureId as string),
    );

    let candidate: CaptureType | null = null;
    let candidateId: string | null = null;
    for (const docSnap of capturesSnap.docs) {
        const id = docSnap.id;
        if (replayedCaptureIds.has(id)) continue;
        candidate = { ...(docSnap.data() as CaptureType), id };
        candidateId = id;
        break;
    }
    if (!candidate || !candidateId || !candidate.analysis) return null;

    const plan = await planScenarioReplayFromCapture({
        capture: candidate,
        userProfile: {
            role: userProfile.role,
            industry: userProfile.industry,
            companyName: userProfile.companyName ?? "",
            companyDescription: userProfile.companyDescription ?? "",
            workplaceCommunicationContext:
                userProfile.workplaceCommunicationContext ?? "",
            motivation: userProfile.motivation ?? "",
            goals: userProfile.goals,
            additionalContext: userProfile.additionalContext,
        },
        skillMemory: {
            strengths: skillMemory.strengths,
            weaknesses: skillMemory.weaknesses,
            masteredFocus: skillMemory.masteredFocus,
            reinforcementFocus: skillMemory.reinforcementFocus,
        },
    });

    return buildSessionFromPlan(uid, plan, {
        sourceCaptureId: candidateId,
        type: "scenario_replay",
    });
}

async function markPendingAsSkipped(
    db: ReturnType<typeof getAdminFirestore>,
    pending: SessionType,
): Promise<void> {
    if (!pending?.id) return;
    await db
        .collection(FirestoreCollections.sessions.path)
        .doc(pending.id)
        .set(
            {
                completionStatus: "skipped",
                completionReason:
                    "Replaced by a different drill the user picked.",
                processingStatus: "idle",
                processingStage: null,
                processingJobId: null,
                processingError: null,
                processingUpdatedAt: new Date().toISOString(),
            },
            { merge: true },
        );
}

/**
 * Pre-generate the user's next drill. Idempotent by default — if a pending
 * drill already exists, returns it unchanged. With `forceFresh: true`, marks
 * any existing pending drill as `skipped` and creates a new one.
 *
 * Drill priority order:
 *   1. Capture-derived (fresh, unpracticed capture within 7 days) — desktop helper users only
 *   2. Regular planner output, personalized via skill memory + learner context
 *
 * `requestedCategory` skips the capture-derived branch (the user explicitly
 * asked for a different category).
 */
export async function pregenerateNextDrillFor(
    uid: string,
    options: PregenerateOptions = {},
): Promise<PregenerateOutcome> {
    try {
        const db = getAdminFirestore();
        const userDoc = await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .get();
        if (!userDoc.exists) return { ok: false, reason: "no_user" };

        const userProfile = userDoc.data() as UserProfileType;

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
        const latestRegularSession = recentSessions.find(
            (s) => s.type !== "scenario_replay",
        );

        const existingPending = recentSessions.find(
            (s) =>
                s.completionStatus === "pending" &&
                s.processingStatus !== "processing",
        );

        const shouldForceFresh = Boolean(
            options.forceFresh || options.requestedCategory,
        );

        // Idempotent path: pending exists, no force — return it.
        if (existingPending && !shouldForceFresh) {
            return { ok: true, session: existingPending, created: false };
        }

        // Block on needs_retry — user must redo current drill first.
        if (
            latestRegularSession?.completionStatus === "needs_retry" &&
            latestRegularSession?.processingStatus !== "processing"
        ) {
            return {
                ok: false,
                reason: "needs_retry",
                session: latestRegularSession,
            };
        }

        // Auto-heal stale processing, or block if it's actually running.
        if (latestRegularSession?.processingStatus === "processing") {
            if (isStaleProcessing(latestRegularSession.processingUpdatedAt)) {
                await db
                    .collection(FirestoreCollections.sessions.path)
                    .doc(latestRegularSession.id)
                    .set(
                        {
                            processingStatus: "failed",
                            processingStage: null,
                            processingJobId: null,
                            processingError:
                                "Processing stalled and was auto-recovered so you could continue.",
                            processingUpdatedAt: new Date().toISOString(),
                        },
                        { merge: true },
                    );
            } else {
                return {
                    ok: false,
                    reason: "still_processing",
                    session: latestRegularSession,
                };
            }
        }

        const enrichedUserProfile = await refreshCompanyResearchIfNeeded(
            db,
            uid,
            userProfile,
        );

        const skillDoc = await db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid)
            .get();
        const hydratedSkillMemory = hydrateSkillMemory(uid, skillDoc.data());
        const skillMemory = await refreshSkillMemoryFromLatestSession(
            db,
            uid,
            hydratedSkillMemory,
            latestSession,
        );

        // If we're forcing fresh and a pending exists, mark it skipped.
        if (existingPending && shouldForceFresh) {
            await markPendingAsSkipped(db, existingPending);
        }

        // Capture-derived priority — only when not skipped and not category-forced.
        if (!options.skipCaptureDerived && !options.requestedCategory) {
            const captureSession = await tryCaptureDerivedDrill(
                db,
                uid,
                enrichedUserProfile,
                skillMemory,
                recentSessions,
            );
            if (captureSession) {
                await db
                    .collection(FirestoreCollections.sessions.path)
                    .doc(captureSession.id)
                    .set(captureSession);
                return {
                    ok: true,
                    session: captureSession,
                    created: true,
                };
            }
        }

        const recentDrills = summarizeSessionsForPlanner(recentSessions);

        const plan = await planNextSession({
            userProfile: {
                role: enrichedUserProfile.role,
                industry: enrichedUserProfile.industry,
                companyName: enrichedUserProfile.companyName ?? "",
                companyDescription:
                    enrichedUserProfile.companyDescription ?? "",
                workplaceCommunicationContext:
                    enrichedUserProfile.workplaceCommunicationContext ?? "",
                wantsInterviewPractice:
                    enrichedUserProfile.wantsInterviewPractice ?? false,
                motivation: enrichedUserProfile.motivation ?? "",
                goals: enrichedUserProfile.goals,
                additionalContext: enrichedUserProfile.additionalContext,
                companyResearch: enrichedUserProfile.companyResearch,
                internalLearnerContext:
                    enrichedUserProfile.internalLearnerContext,
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
            requestedCategory: options.requestedCategory,
        });

        const session = buildSessionFromPlan(uid, plan);
        await db
            .collection(FirestoreCollections.sessions.path)
            .doc(session.id)
            .set(session);

        return { ok: true, session, created: true };
    } catch (error) {
        return {
            ok: false,
            reason: "error",
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to pre-generate drill.",
        };
    }
}
