import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { analyzeCaptureDeep } from "@/lib/captures/analyze";
import { getOrHydrateLearnerModel } from "@/lib/learner-model/store";
import type { CaptureType, UserProfileType } from "@/schemas";

export const runtime = "nodejs";

/**
 * Admin-only insight re-trigger for iterating on the `coachingInsight` prompt
 * without recording fresh captures. Re-runs `analyzeCaptureDeep` against the
 * capture's stored `serverTranscript` and returns the new insight (with the
 * currently-persisted one for side-by-side comparison). PREVIEW ONLY — does
 * NOT write to Firestore, so iterating on the prompt can't corrupt analyzed
 * captures.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    try {
        const db = getAdminFirestore();
        const ref = db
            .collection(FirestoreCollections.captures.path)
            .doc(id);
        const snap = await ref.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: "Capture not found." },
                { status: 404 },
            );
        }
        const capture = snap.data() as CaptureType;

        const transcript = capture.serverTranscript ?? [];
        if (transcript.length === 0) {
            return NextResponse.json(
                {
                    error: "Capture has no serverTranscript yet — wait for transcription to finish first.",
                },
                { status: 409 },
            );
        }

        // Mirror runAnalysisAndProfiling's context loading so the preview
        // matches what a real re-run on this capture would produce.
        const [userSnap, model] = await Promise.all([
            db
                .collection(FirestoreCollections.users.path)
                .doc(capture.uid)
                .get(),
            getOrHydrateLearnerModel(db, capture.uid),
        ]);
        const userProfile = (userSnap.data() ?? {}) as Partial<UserProfileType>;

        const recentCapturesSnap = await db
            .collection(FirestoreCollections.captures.path)
            .where("uid", "==", capture.uid)
            .orderBy("startedAt", "desc")
            .limit(10)
            .get();
        const differential = {
            trackedPatterns: model.trackedPatterns,
            recentMainIssues: recentCapturesSnap.docs
                .filter((d) => d.id !== id)
                .map((d) => ({ docId: d.id, data: d.data() as CaptureType }))
                .filter((x) => x.data.analysis?.mainIssue)
                .slice(0, 5)
                .map((x) => ({
                    sourceId: x.docId,
                    mainIssue: x.data.analysis!.mainIssue,
                    createdAt: x.data.startedAt,
                })),
        };

        const started = Date.now();
        const { analysis: newAnalysis } = await analyzeCaptureDeep({
            transcript,
            agentTitle: capture.title,
            agentSummary: capture.summary,
            durationSecs: capture.durationSecs ?? 0,
            userProfile: {
                role: userProfile.role ?? "",
                industry: userProfile.industry ?? "",
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
                strengths: model.strengths,
                weaknesses: model.weaknesses,
                masteredFocus: model.masteredFocus,
                reinforcementFocus: model.reinforcementFocus,
            },
            differential,
        });
        const elapsedMs = Date.now() - started;

        return NextResponse.json({
            ok: true,
            elapsedMs,
            currentInsight: capture.analysis?.coachingInsight ?? null,
            newInsight: newAnalysis.coachingInsight ?? null,
        });
    } catch (error) {
        console.error(
            `[api/admin/captures/${id}/reanalyze-insight] POST failed`,
            error,
        );
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to re-run insight analysis.",
            },
            { status: 500 },
        );
    }
}
