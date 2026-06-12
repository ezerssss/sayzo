import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/require-auth";
import {
    checkCorrectionGuards,
    mergeVocabulary,
    type CorrectionCandidate,
} from "@/lib/captures/corrections";
import { judgeCorrections } from "@/lib/captures/correction-judge";
import {
    assertHasCredit,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    getOrHydrateLearnerModel,
    updateLearnerModel,
} from "@/lib/learner-model/store";
import type { CaptureType, TranscriptCorrection } from "@/schemas";
import {
    FirestoreCollections,
    MAX_CORRECTION_REPLACEMENT_CHARS,
    MAX_CORRECTIONS_PER_CAPTURE,
} from "@/schemas";

export const runtime = "nodejs";

const submitBodySchema = z.object({
    corrections: z
        .array(
            z.object({
                transcriptIdx: z.number().int().min(0),
                charStart: z.number().int().min(0),
                charEnd: z.number().int().min(1),
                original: z.string().min(1),
                replacement: z
                    .string()
                    .min(1)
                    .max(MAX_CORRECTION_REPLACEMENT_CHARS),
            }),
        )
        .min(1)
        .max(MAX_CORRECTIONS_PER_CAPTURE),
});

type SubmitResult =
    | { index: number; accepted: true; isVocabularyTerm: boolean }
    | { index: number; accepted: false; reason: string };

/**
 * Submit transcript corrections (mishearing fixes) for a capture.
 *
 * The stored transcript is never mutated — accepted corrections are appended
 * to `transcriptCorrections` and applied as a display/read-time overlay.
 * Validation is two-layered: deterministic guards (lib/captures/corrections.ts)
 * then an LLM mishearing judge. Cost posture: the judge call is uncharged —
 * accepted leak, hard-capped at MAX_CORRECTIONS_PER_CAPTURE batched-mini calls
 * per capture lifetime; `assertHasCredit` still blocks exhausted users
 * (feedback-chat precedent).
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: captureId } = await params;

    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    // Webapp-only: a leaked long-lived desktop-agent token must not be able to
    // rewrite transcripts or poison the ASR vocabulary (requireAdmin precedent).
    if (auth.source !== "firebase") {
        return NextResponse.json(
            { error: "This action is only available from the Sayzo web app." },
            { status: 403 },
        );
    }

    let body: z.infer<typeof submitBodySchema>;
    try {
        body = submitBodySchema.parse(await request.json());
    } catch {
        return NextResponse.json(
            { error: "Invalid request body." },
            { status: 400 },
        );
    }

    try {
        const db = getAdminFirestore();
        const captureRef = db
            .collection(FirestoreCollections.captures.path)
            .doc(captureId);

        const captureSnap = await captureRef.get();
        if (!captureSnap.exists) {
            return NextResponse.json(
                { error: "Conversation not found." },
                { status: 404 },
            );
        }
        const capture = captureSnap.data() as CaptureType;
        if (capture.uid !== uid) {
            return NextResponse.json(
                { error: "Not authorized to access this conversation." },
                { status: 403 },
            );
        }
        const transcript = capture.serverTranscript;
        if (!transcript || transcript.length === 0) {
            return NextResponse.json(
                { error: "This conversation's transcript isn't ready yet." },
                { status: 409 },
            );
        }

        try {
            await assertHasCredit(uid);
        } catch (err) {
            if (err instanceof CreditLimitReachedError) {
                return creditLimitResponse();
            }
            throw err;
        }

        const existing = capture.transcriptCorrections ?? [];
        const candidates: CorrectionCandidate[] = body.corrections;

        // Layer 1: deterministic guards. Guard-passing candidates accumulate
        // into `passedGuards` so in-batch overlaps are caught.
        const results: SubmitResult[] = [];
        const passedGuards: { index: number; candidate: CorrectionCandidate }[] =
            [];
        for (let i = 0; i < candidates.length; i++) {
            const guardRejection = checkCorrectionGuards(
                candidates[i],
                transcript,
                existing,
                passedGuards.map((p) => p.candidate),
            );
            if (guardRejection) {
                results.push({
                    index: i,
                    accepted: false,
                    reason: guardRejection.message,
                });
            } else {
                passedGuards.push({ index: i, candidate: candidates[i] });
            }
        }

        // Layer 2: LLM mishearing judge — one batched call for the survivors.
        const judged = await judgeCorrections(
            passedGuards.map(({ index, candidate }) => ({
                index,
                turnText: transcript[candidate.transcriptIdx].text,
                original: candidate.original,
                replacement: candidate.replacement,
            })),
        );

        const accepted: TranscriptCorrection[] = [];
        const now = new Date().toISOString();
        for (const verdict of judged) {
            if (!verdict.accepted) {
                results.push(verdict);
                continue;
            }
            const candidate = candidates[verdict.index];
            accepted.push({
                ...candidate,
                replacement: candidate.replacement.trim(),
                isVocabularyTerm: verdict.isVocabularyTerm,
                createdAt: now,
            });
            results.push(verdict);
        }

        if (accepted.length > 0) {
            // Transaction (not arrayUnion): the cap and overlap checks must be
            // atomic against concurrent submissions from another tab.
            await db.runTransaction(async (tx) => {
                const freshSnap = await tx.get(captureRef);
                const fresh = (freshSnap.data() ?? {}) as CaptureType;
                const current = fresh.transcriptCorrections ?? [];
                const room = MAX_CORRECTIONS_PER_CAPTURE - current.length;
                const safe = accepted
                    .filter(
                        (a) =>
                            !current.some(
                                (c) =>
                                    c.transcriptIdx === a.transcriptIdx &&
                                    a.charStart < c.charEnd &&
                                    c.charStart < a.charEnd,
                            ),
                    )
                    .slice(0, Math.max(0, room));
                if (safe.length > 0) {
                    tx.set(
                        captureRef,
                        { transcriptCorrections: [...current, ...safe] },
                        { merge: true },
                    );
                }
            });

            // Vocabulary update is best-effort: the corrections are already
            // committed; a vocab failure must not fail the request.
            const vocabTerms = accepted
                .filter((a) => a.isVocabularyTerm)
                .map((a) => a.replacement);
            if (vocabTerms.length > 0) {
                try {
                    const model = await getOrHydrateLearnerModel(db, uid);
                    await updateLearnerModel(db, uid, {
                        asrVocabulary: mergeVocabulary(
                            model.asrVocabulary,
                            vocabTerms,
                        ),
                    });
                } catch (err) {
                    console.error(
                        `[api/captures/${captureId}/corrections] vocabulary update failed`,
                        err,
                    );
                }
            }
        }

        results.sort((a, b) => a.index - b.index);
        return NextResponse.json({ results }, { status: 200 });
    } catch (error) {
        console.error(
            `[api/captures/${captureId}/corrections] POST failed`,
            error,
        );
        return NextResponse.json(
            { error: "Sayzo couldn't check this fix just now. Please try again." },
            { status: 502 },
        );
    }
}
