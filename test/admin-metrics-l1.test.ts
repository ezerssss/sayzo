import { describe, expect, it } from "vitest";

import {
    aggregateCohorts,
    aggregateErrors,
    aggregateLatency,
    aggregateQuality,
    normalizeErrorSignature,
    resolveWindow,
} from "@/lib/admin/metrics-l1";
import type { CaptureType, ItemAnalysis, SessionType } from "@/schemas";
import type { UserProfileType } from "@/schemas";

function cap(p: Partial<CaptureType>): CaptureType {
    return {
        uid: "u",
        status: "analyzed",
        rejectionReason: null,
        uploadedAt: "2026-06-01T00:00:00.000Z",
        agentRecordId: "r",
        startedAt: "2026-06-01T00:00:00.000Z",
        endedAt: "2026-06-01T00:01:00.000Z",
        title: "",
        summary: "",
        closeReason: "shutdown",
        audioStoragePath: "",
        ...p,
    } as CaptureType;
}

function analysis(p: Partial<ItemAnalysis>): ItemAnalysis {
    return p as unknown as ItemAnalysis;
}

function ses(p: Partial<SessionType>): SessionType {
    return {
        id: "s",
        uid: "u",
        plan: {} as SessionType["plan"],
        audioUrl: null,
        transcript: null,
        analysis: null,
        feedback: null,
        completionStatus: "pending",
        completionReason: null,
        createdAt: "2026-06-01T00:00:00.000Z",
        ...p,
    } as SessionType;
}

describe("aggregateQuality", () => {
    it("counts statuses, insight presence, rejection buckets and verdicts", () => {
        const captures: CaptureType[] = [
            cap({
                status: "analyzed",
                analysis: analysis({
                    coachingInsight: {
                        type: "clarity",
                        headline: "h",
                        quote: null,
                        body: "b",
                        why: null,
                    },
                    turnRewrites: [
                        { verdict: "keep" } as never,
                        { verdict: "tighten" } as never,
                        { verdict: "non_english" } as never,
                    ],
                }),
                transcriptCorrections: [
                    { isVocabularyTerm: true } as never,
                    { isVocabularyTerm: false } as never,
                ],
                echoLeakSuppressed: 2,
            }),
            cap({
                status: "analyzed",
                analysis: analysis({ coachingInsight: null, turnRewrites: [] }),
            }),
            cap({
                status: "rejected",
                rejectionReason:
                    "This conversation didn't have enough English speech from you for Sayzo to coach.",
            }),
            cap({
                status: "rejected",
                rejectionReason: "Conversation did not meet relevance criteria",
            }),
        ];
        const sessions: SessionType[] = [
            ses({ completionStatus: "passed" }),
            ses({ completionStatus: "needs_retry" }),
            ses({ completionStatus: "passed" }),
        ];

        const q = aggregateQuality(captures, sessions);

        expect(q.capturesScanned).toBe(4);
        expect(q.captureStatusCounts.analyzed).toBe(2);
        expect(q.captureStatusCounts.rejected).toBe(2);
        expect(q.analyzedWithAnalysis).toBe(2);
        expect(q.coachingInsightPresent).toBe(1);
        expect(q.coachingInsightNull).toBe(1);
        expect(q.rejectedTotal).toBe(2);
        expect(q.rejectionBuckets.no_coachable_english).toBe(1);
        expect(q.rejectionBuckets.other).toBe(1);
        expect(q.turnRewritesTotal).toBe(3);
        expect(q.turnRewriteVerdictCounts.keep).toBe(1);
        expect(q.turnRewriteVerdictCounts.tighten).toBe(1);
        expect(q.turnRewriteVerdictCounts.non_english).toBe(1);
        expect(q.correctionsTotal).toBe(2);
        expect(q.correctionsVocabularyTerms).toBe(1);
        expect(q.capturesWithCorrections).toBe(1);
        expect(q.echoLeakSuppressedTotal).toBe(2);
        expect(q.capturesWithEchoLeak).toBe(1);
        expect(q.sessionCompletionCounts.passed).toBe(2);
        expect(q.sessionCompletionCounts.needs_retry).toBe(1);
    });
});

describe("aggregateLatency", () => {
    it("computes percentiles and histogram from upload→analyzed", () => {
        // 5s, 20s, 120s deltas
        const captures: CaptureType[] = [
            cap({
                uploadedAt: "2026-06-01T00:00:00.000Z",
                analyzedAt: "2026-06-01T00:00:05.000Z",
            }),
            cap({
                uploadedAt: "2026-06-01T00:00:00.000Z",
                analyzedAt: "2026-06-01T00:00:20.000Z",
            }),
            cap({
                uploadedAt: "2026-06-01T00:00:00.000Z",
                analyzedAt: "2026-06-01T00:02:00.000Z",
            }),
            // no analyzedAt → excluded
            cap({ uploadedAt: "2026-06-01T00:00:00.000Z" }),
        ];

        const lat = aggregateLatency(captures);
        expect(lat.sampleCount).toBe(3);
        expect(lat.maxSecs).toBe(120);
        expect(lat.p50Secs).toBe(20);
        expect(lat.histogram["<10s"]).toBe(1);
        expect(lat.histogram["10-30s"]).toBe(1);
        expect(lat.histogram["1-3m"]).toBe(1);
    });
});

describe("normalizeErrorSignature", () => {
    it("strips quoted spans (privacy) and normalizes numbers/ids", () => {
        const sig = normalizeErrorSignature(
            'Failed to parse "the user said something private" after 3 retries (job a1b2c3d4e5f6)',
        );
        expect(sig).not.toContain("something private");
        expect(sig).toContain('"…"');
        expect(sig).toContain("<n>");
        expect(sig).toContain("<id>");
    });

    it("clusters the same error with different numbers identically", () => {
        const a = normalizeErrorSignature("timeout after 30s");
        const b = normalizeErrorSignature("timeout after 90s");
        expect(a).toBe(b);
    });
});

describe("aggregateErrors", () => {
    it("clusters failed captures and sessions by signature", () => {
        const captures: CaptureType[] = [
            cap({ status: "analyze_failed", error: "timeout after 30s" }),
            cap({ status: "analyze_failed", error: "timeout after 99s" }),
            cap({ status: "transcribe_failed", error: "deepgram 500" }),
            cap({ status: "analyzed" }), // not failed
        ];
        const sessions: SessionType[] = [
            ses({ processingStatus: "failed", processingError: "boom" }),
            ses({ processingStatus: "idle" }),
        ];

        const e = aggregateErrors(captures, sessions);
        expect(e.failedCaptures).toBe(3);
        expect(e.failedSessions).toBe(1);
        // the two timeouts cluster into one row of count 2
        const timeout = e.clusters.find((c) => c.signature.includes("timeout"));
        expect(timeout?.count).toBe(2);
        expect(e.clusters[0].count).toBe(2); // sorted desc
    });
});

describe("aggregateCohorts", () => {
    it("counts onboarding, full access and activity windows", () => {
        const recent = new Date(Date.now() - 2 * 86400000).toISOString();
        const old = new Date(Date.now() - 20 * 86400000).toISOString();
        const users: UserProfileType[] = [
            {
                uid: "a",
                onboardingComplete: true,
                hasFullAccess: true,
                agentLastSeenAt: recent,
                createdAt: "2026-06-01T00:00:00.000Z",
            } as UserProfileType,
            {
                uid: "b",
                onboardingComplete: false,
                agentLastSeenAt: old,
                createdAt: "2026-06-02T00:00:00.000Z",
            } as UserProfileType,
        ];

        const c = aggregateCohorts(
            users,
            [cap({ uploadedAt: "2026-06-01T00:00:00.000Z" })],
            [ses({ createdAt: "2026-06-01T00:00:00.000Z" })],
        );
        expect(c.totalUsers).toBe(2);
        expect(c.onboardingComplete).toBe(1);
        expect(c.fullAccess).toBe(1);
        expect(c.activeLast7d).toBe(1);
        expect(c.activeLast30d).toBe(2);
        expect(c.capturesInWindow).toBe(1);
        expect(c.sessionsInWindow).toBe(1);
    });
});

describe("resolveWindow", () => {
    it("defaults to a 30-day window", () => {
        const w = resolveWindow(null, null);
        expect(w.days).toBe(30);
        expect(new Date(w.fromIso).getTime()).toBeLessThan(
            new Date(w.toIso).getTime(),
        );
    });

    it("honors an explicit from", () => {
        const from = new Date(Date.now() - 7 * 86400000).toISOString();
        const w = resolveWindow(from, null);
        expect(w.days).toBe(7);
    });
});
