import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { requireAuth } from "@/lib/auth/require-auth";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    synthesizeFocusInsights,
    updateFocusInsightsIncremental,
} from "@/services/focus-synthesizer";
import type { CaptureType } from "@/types/captures";
import {
    FOCUS_INSIGHTS_VERSION,
    type UserFocusInsights,
} from "@/types/focus-insights";
import type { SessionType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

export const runtime = "nodejs";

type RefreshRequestBody = {
    /**
     * When true, discard the existing insights doc and do a full cold-start
     * synthesis from all available sessions/captures. Incremental updates
     * handle the steady state; this escape hatch is for schema migrations or
     * when a user explicitly wants to start the coaching view over.
     */
    rebuild?: unknown;
};

/**
 * Walk newest-first through sessions and collect analyzed ones until we hit
 * the last-considered cursor. Anything before the cursor is "new since last
 * update." Returns `cursorFound: false` when the cursor id isn't present in
 * the current list — that means the caller should fall back to a full
 * rebuild rather than trust the delta.
 */
function collectNewAnalyzedSessions(
    sessions: SessionType[],
    cursor: string,
): { newSessions: SessionType[]; cursorFound: boolean } {
    if (!cursor) {
        return {
            newSessions: sessions.filter((s) => !!s.analysis),
            cursorFound: true,
        };
    }
    const out: SessionType[] = [];
    for (const s of sessions) {
        if (s.id === cursor) {
            return { newSessions: out, cursorFound: true };
        }
        if (s.analysis) out.push(s);
    }
    return { newSessions: out, cursorFound: false };
}

function collectNewAnalyzedCaptures(
    captures: CaptureType[],
    cursor: string,
): { newCaptures: CaptureType[]; cursorFound: boolean } {
    if (!cursor) {
        return {
            newCaptures: captures.filter((c) => !!c.analysis && !!c.id),
            cursorFound: true,
        };
    }
    const out: CaptureType[] = [];
    for (const c of captures) {
        if (c.id === cursor) {
            return { newCaptures: out, cursorFound: true };
        }
        if (c.analysis && c.id) out.push(c);
    }
    return { newCaptures: out, cursorFound: false };
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let body: RefreshRequestBody;
    try {
        body = (await request.json()) as RefreshRequestBody;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const rebuild = body.rebuild === true;

    try {
        const db = getAdminFirestore();

        const [userSnap, skillSnap, sessionsSnap, capturesSnap, insightsSnap] =
            await Promise.all([
                db.collection(FirestoreCollections.users.path).doc(uid).get(),
                db
                    .collection(FirestoreCollections.skillMemories.path)
                    .doc(uid)
                    .get(),
                db
                    .collection(FirestoreCollections.sessions.path)
                    .where("uid", "==", uid)
                    .orderBy("createdAt", "desc")
                    .limit(60)
                    .get(),
                db
                    .collection(FirestoreCollections.captures.path)
                    .where("uid", "==", uid)
                    .orderBy("startedAt", "desc")
                    .limit(20)
                    .get(),
                db
                    .collection(FirestoreCollections.userFocusInsights.path)
                    .doc(uid)
                    .get(),
            ]);

        if (!userSnap.exists) {
            return NextResponse.json(
                { error: "User profile not found." },
                { status: 404 },
            );
        }
        const userProfile = userSnap.data() as UserProfileType;

        const skillData = skillSnap.data();
        const skillMemory: Pick<
            SkillMemoryType,
            "strengths" | "weaknesses" | "masteredFocus" | "reinforcementFocus"
        > = {
            strengths: Array.isArray(skillData?.strengths)
                ? (skillData!.strengths as string[])
                : [],
            weaknesses: Array.isArray(skillData?.weaknesses)
                ? (skillData!.weaknesses as string[])
                : [],
            masteredFocus: Array.isArray(skillData?.masteredFocus)
                ? (skillData!.masteredFocus as string[])
                : [],
            reinforcementFocus: Array.isArray(skillData?.reinforcementFocus)
                ? (skillData!.reinforcementFocus as string[])
                : [],
        };

        const sessions: SessionType[] = sessionsSnap.docs.map(
            (doc) =>
                ({
                    ...(doc.data() as SessionType),
                    id: doc.id,
                }) as SessionType,
        );
        const captures: CaptureType[] = capturesSnap.docs.map(
            (doc) =>
                ({
                    ...(doc.data() as CaptureType),
                    id: doc.id,
                }) as CaptureType,
        );

        const existing = insightsSnap.exists
            ? (insightsSnap.data() as UserFocusInsights)
            : null;

        const profileSlice = {
            role: userProfile.role,
            industry: userProfile.industry,
            companyName: userProfile.companyName ?? "",
            companyDescription: userProfile.companyDescription ?? "",
            workplaceCommunicationContext:
                userProfile.workplaceCommunicationContext ?? "",
            wantsInterviewPractice:
                userProfile.wantsInterviewPractice ?? false,
            motivation: userProfile.motivation ?? "",
            goals: userProfile.goals,
            additionalContext: userProfile.additionalContext,
        };

        // Decide between cold-start synthesis and incremental update.
        const canIncremental =
            !rebuild &&
            !!existing &&
            existing.version === FOCUS_INSIGHTS_VERSION;

        let incrementalAttempt: {
            newSessions: SessionType[];
            newCaptures: CaptureType[];
        } | null = null;
        if (canIncremental && existing) {
            const { newSessions, cursorFound: sessionCursorFound } =
                collectNewAnalyzedSessions(sessions, existing.lastSessionId);
            const { newCaptures, cursorFound: captureCursorFound } =
                collectNewAnalyzedCaptures(captures, existing.lastCaptureId);
            // If either cursor is missing (deleted data, re-ordering, etc.)
            // we can't trust the delta — fall back to a cold synthesis.
            if (sessionCursorFound && captureCursorFound) {
                incrementalAttempt = { newSessions, newCaptures };
            }
        }

        // Nothing changed since last update — skip the LLM call entirely.
        if (
            incrementalAttempt &&
            incrementalAttempt.newSessions.length === 0 &&
            incrementalAttempt.newCaptures.length === 0 &&
            existing
        ) {
            return NextResponse.json({
                ok: true,
                insights: existing,
                regenerated: false,
                mode: "cached",
            });
        }

        const synthesis = incrementalAttempt
            ? await updateFocusInsightsIncremental({
                  userProfile: profileSlice,
                  skillMemory,
                  priorInsights: existing as UserFocusInsights,
                  newSessions: incrementalAttempt.newSessions,
                  newCaptures: incrementalAttempt.newCaptures,
              })
            : await synthesizeFocusInsights({
                  userProfile: profileSlice,
                  skillMemory,
                  sessions,
                  captures,
              });

        const now = new Date().toISOString();
        const insights: UserFocusInsights = {
            uid,
            ...synthesis,
            generatedAt: existing?.generatedAt ?? now,
            updatedAt: now,
            version: FOCUS_INSIGHTS_VERSION,
        };
        // On a rebuild or cold start, stamp `generatedAt` as now. Otherwise
        // keep the original creation timestamp so the UI can show stable
        // "tracked since" copy if we ever want it.
        if (!incrementalAttempt) {
            insights.generatedAt = now;
        }

        await db
            .collection(FirestoreCollections.userFocusInsights.path)
            .doc(uid)
            .set(insights, { merge: false });

        return NextResponse.json({
            ok: true,
            insights,
            regenerated: true,
            mode: incrementalAttempt ? "incremental" : "bootstrap",
        });
    } catch (error) {
        console.error("[app/api/focus/refresh] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to refresh focus insights.",
            },
            { status: 500 },
        );
    }
}
