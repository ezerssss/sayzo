import "server-only";

import { FirestoreCollections } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type {
    CaptureStatus,
    CaptureType,
    ItemReaction,
    RewriteVerdict,
    SessionCompletionStatus,
    SessionType,
    UserProfileType,
} from "@/schemas";

/**
 * Layer-1 ("retroactive") metrics: on-read aggregation over already-persisted,
 * transcript-free fields on `captures`/`sessions`/`users`. No new collection,
 * works on all existing data. Phase C replaces these with rollups over the
 * `llm_events` store; until then this is how admins see prompt health.
 *
 * Privacy note: every value returned here is a count, an enum, a duration, or a
 * normalized error signature with quoted spans stripped (`normalizeErrorSignature`).
 * No transcript text, quote, or anchor ever leaves this module — admins follow a
 * doc id into the existing gated endpoints when they need the underlying text.
 */

/** Hard cap on docs pulled per request so a huge window can't blow up memory. */
const SCAN_CAP = 3000;
const DEFAULT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MetricsWindow = {
    fromIso: string;
    toIso: string;
    days: number;
};

export function resolveWindow(
    fromParam?: string | null,
    toParam?: string | null,
): MetricsWindow {
    const now = new Date();
    const parsedTo = toParam ? new Date(toParam) : now;
    const toDate = Number.isNaN(parsedTo.getTime()) ? now : parsedTo;

    const defaultFrom = new Date(
        toDate.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS,
    );
    const parsedFrom = fromParam ? new Date(fromParam) : defaultFrom;
    const fromDate = Number.isNaN(parsedFrom.getTime())
        ? defaultFrom
        : parsedFrom;

    const days = Math.max(
        1,
        Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS),
    );

    return {
        fromIso: fromDate.toISOString(),
        toIso: toDate.toISOString(),
        days,
    };
}

type Scan<T> = { rows: T[]; indexError: boolean; truncated: boolean };

/**
 * Captures uploaded within the window, newest first. Range + orderBy on the same
 * field (`uploadedAt`) needs only the automatic single-field index — no
 * composite. On any query error we degrade to an empty set + `indexError` so the
 * caller can surface the index-creation hint (mirrors /api/admin/jobs/failed).
 */
export async function fetchCapturesInWindow(
    window: MetricsWindow,
): Promise<Scan<CaptureType>> {
    const db = getAdminFirestore();
    try {
        const snap = await db
            .collection(FirestoreCollections.captures.path)
            .where("uploadedAt", ">=", window.fromIso)
            .where("uploadedAt", "<=", window.toIso)
            .orderBy("uploadedAt", "desc")
            .limit(SCAN_CAP)
            .get();
        return {
            rows: snap.docs.map((d) => ({
                ...(d.data() as CaptureType),
                id: d.id,
            })),
            indexError: false,
            truncated: snap.docs.length >= SCAN_CAP,
        };
    } catch (error) {
        console.warn(
            "[metrics-l1] captures window query failed (likely missing index)",
            error,
        );
        return { rows: [], indexError: true, truncated: false };
    }
}

export async function fetchSessionsInWindow(
    window: MetricsWindow,
): Promise<Scan<SessionType>> {
    const db = getAdminFirestore();
    try {
        const snap = await db
            .collection(FirestoreCollections.sessions.path)
            .where("createdAt", ">=", window.fromIso)
            .where("createdAt", "<=", window.toIso)
            .orderBy("createdAt", "desc")
            .limit(SCAN_CAP)
            .get();
        return {
            rows: snap.docs.map((d) => ({
                ...(d.data() as SessionType),
                id: d.id,
            })),
            indexError: false,
            truncated: snap.docs.length >= SCAN_CAP,
        };
    } catch (error) {
        console.warn(
            "[metrics-l1] sessions window query failed (likely missing index)",
            error,
        );
        return { rows: [], indexError: true, truncated: false };
    }
}

export async function fetchReactionsInWindow(
    window: MetricsWindow,
): Promise<Scan<ItemReaction>> {
    const db = getAdminFirestore();
    try {
        const snap = await db
            .collection(FirestoreCollections.itemReactions.path)
            .where("createdAt", ">=", window.fromIso)
            .where("createdAt", "<=", window.toIso)
            .orderBy("createdAt", "desc")
            .limit(SCAN_CAP)
            .get();
        return {
            rows: snap.docs.map((d) => d.data() as ItemReaction),
            indexError: false,
            truncated: snap.docs.length >= SCAN_CAP,
        };
    } catch (error) {
        console.warn(
            "[metrics-l1] reactions window query failed (likely missing index)",
            error,
        );
        return { rows: [], indexError: true, truncated: false };
    }
}

export async function fetchUsers(): Promise<Scan<UserProfileType>> {
    const db = getAdminFirestore();
    try {
        const snap = await db
            .collection(FirestoreCollections.users.path)
            .limit(SCAN_CAP)
            .get();
        return {
            rows: snap.docs.map((d) => d.data() as UserProfileType),
            indexError: false,
            truncated: snap.docs.length >= SCAN_CAP,
        };
    } catch (error) {
        console.warn("[metrics-l1] users scan failed", error);
        return { rows: [], indexError: true, truncated: false };
    }
}

// ── Quality (the /admin/prompts view) ──────────────────────────────────────

const REWRITE_VERDICTS: RewriteVerdict[] = [
    "keep",
    "tighten",
    "sharpen",
    "reframe",
    "reorder",
    "non_english",
];

const CAPTURE_STATUSES: CaptureStatus[] = [
    "queued",
    "transcribing",
    "transcribed",
    "validating",
    "validated",
    "rejected",
    "analyzing",
    "profiling",
    "analyzed",
    "transcribe_failed",
    "validate_failed",
    "analyze_failed",
    "profile_failed",
];

const SESSION_COMPLETION_STATUSES: SessionCompletionStatus[] = [
    "pending",
    "passed",
    "needs_retry",
    "skipped",
];

/**
 * The persisted "no coachable English" rejection is a fixed server constant
 * (lib/captures/validate.ts). We classify the rejection bucket by detecting that
 * sentinel rather than echoing the raw `rejectionReason` (which, for other
 * rejection kinds, can be LLM-authored and may paraphrase the conversation).
 */
const NO_COACHABLE_ENGLISH_NEEDLE = "enough English speech";

export type QualityL1 = {
    capturesScanned: number;
    captureStatusCounts: Record<string, number>;
    /** Among captures that reached analysis (have an `analysis` object). */
    analyzedWithAnalysis: number;
    coachingInsightPresent: number;
    coachingInsightNull: number;
    rejectedTotal: number;
    rejectionBuckets: { no_coachable_english: number; other: number };
    turnRewriteVerdictCounts: Record<string, number>;
    turnRewritesTotal: number;
    correctionsTotal: number;
    correctionsVocabularyTerms: number;
    capturesWithCorrections: number;
    echoLeakSuppressedTotal: number;
    capturesWithEchoLeak: number;
    sessionsScanned: number;
    sessionCompletionCounts: Record<string, number>;
};

export function aggregateQuality(
    captures: CaptureType[],
    sessions: SessionType[],
): QualityL1 {
    const captureStatusCounts: Record<string, number> = Object.fromEntries(
        CAPTURE_STATUSES.map((s) => [s, 0]),
    );
    const turnRewriteVerdictCounts: Record<string, number> = Object.fromEntries(
        REWRITE_VERDICTS.map((v) => [v, 0]),
    );

    let analyzedWithAnalysis = 0;
    let coachingInsightPresent = 0;
    let coachingInsightNull = 0;
    let rejectedTotal = 0;
    let noCoachableEnglish = 0;
    let otherRejection = 0;
    let turnRewritesTotal = 0;
    let correctionsTotal = 0;
    let correctionsVocabularyTerms = 0;
    let capturesWithCorrections = 0;
    let echoLeakSuppressedTotal = 0;
    let capturesWithEchoLeak = 0;

    for (const c of captures) {
        if (c.status in captureStatusCounts) {
            captureStatusCounts[c.status] += 1;
        } else {
            captureStatusCounts[c.status] = 1;
        }

        if (c.status === "rejected") {
            rejectedTotal += 1;
            if (
                (c.rejectionReason ?? "").includes(NO_COACHABLE_ENGLISH_NEEDLE)
            ) {
                noCoachableEnglish += 1;
            } else {
                otherRejection += 1;
            }
        }

        if (c.analysis) {
            analyzedWithAnalysis += 1;
            if (c.analysis.coachingInsight) {
                coachingInsightPresent += 1;
            } else {
                coachingInsightNull += 1;
            }
            for (const t of c.analysis.turnRewrites ?? []) {
                turnRewritesTotal += 1;
                turnRewriteVerdictCounts[t.verdict] =
                    (turnRewriteVerdictCounts[t.verdict] ?? 0) + 1;
            }
        }

        const corrections = c.transcriptCorrections ?? [];
        if (corrections.length > 0) {
            capturesWithCorrections += 1;
            correctionsTotal += corrections.length;
            correctionsVocabularyTerms += corrections.filter(
                (x) => x.isVocabularyTerm,
            ).length;
        }

        if (c.echoLeakSuppressed && c.echoLeakSuppressed > 0) {
            capturesWithEchoLeak += 1;
            echoLeakSuppressedTotal += c.echoLeakSuppressed;
        }
    }

    const sessionCompletionCounts: Record<string, number> = Object.fromEntries(
        SESSION_COMPLETION_STATUSES.map((s) => [s, 0]),
    );
    for (const s of sessions) {
        const key = s.completionStatus ?? "pending";
        sessionCompletionCounts[key] = (sessionCompletionCounts[key] ?? 0) + 1;
    }

    return {
        capturesScanned: captures.length,
        captureStatusCounts,
        analyzedWithAnalysis,
        coachingInsightPresent,
        coachingInsightNull,
        rejectedTotal,
        rejectionBuckets: {
            no_coachable_english: noCoachableEnglish,
            other: otherRejection,
        },
        turnRewriteVerdictCounts,
        turnRewritesTotal,
        correctionsTotal,
        correctionsVocabularyTerms,
        capturesWithCorrections,
        echoLeakSuppressedTotal,
        capturesWithEchoLeak,
        sessionsScanned: sessions.length,
        sessionCompletionCounts,
    };
}

// ── User reactions ─────────────────────────────────────────────────────────

export type ReactionAggregate = {
    total: number;
    up: number;
    down: number;
    reasonCodeCounts: Record<string, number>;
};

export function aggregateReactions(
    reactions: ItemReaction[],
): ReactionAggregate {
    let up = 0;
    let down = 0;
    const reasonCodeCounts: Record<string, number> = {};
    for (const r of reactions) {
        if (r.rating === "up") up += 1;
        else if (r.rating === "down") down += 1;
        if (r.reasonCode) {
            reasonCodeCounts[r.reasonCode] =
                (reasonCodeCounts[r.reasonCode] ?? 0) + 1;
        }
    }
    return { total: reactions.length, up, down, reasonCodeCounts };
}

// ── Latency / SLA ──────────────────────────────────────────────────────────

/**
 * Bucket boundaries (seconds) for the upload→analyzed histogram. Wide because
 * the duration spans queue-wait (cron cadence) + analysis, so values land in
 * minutes, not milliseconds.
 */
const LATENCY_BUCKETS_SECS: Array<{ label: string; maxSecs: number }> = [
    { label: "<10s", maxSecs: 10 },
    { label: "10-30s", maxSecs: 30 },
    { label: "30-60s", maxSecs: 60 },
    { label: "1-3m", maxSecs: 180 },
    { label: "3-10m", maxSecs: 600 },
    { label: "10m+", maxSecs: Infinity },
];

export type LatencyStats = {
    /** Captures with both `uploadedAt` and `analyzedAt` set. */
    sampleCount: number;
    p50Secs: number;
    p90Secs: number;
    p95Secs: number;
    p99Secs: number;
    maxSecs: number;
    histogram: Record<string, number>;
};

function percentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
    return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, idx))];
}

export function aggregateLatency(captures: CaptureType[]): LatencyStats {
    const durationsSecs: number[] = [];
    const histogram: Record<string, number> = Object.fromEntries(
        LATENCY_BUCKETS_SECS.map((b) => [b.label, 0]),
    );

    for (const c of captures) {
        if (!c.analyzedAt || !c.uploadedAt) continue;
        const ms =
            new Date(c.analyzedAt).getTime() - new Date(c.uploadedAt).getTime();
        if (!Number.isFinite(ms) || ms <= 0) continue;
        const secs = ms / 1000;
        durationsSecs.push(secs);
        const bucket = LATENCY_BUCKETS_SECS.find((b) => secs < b.maxSecs);
        if (bucket) histogram[bucket.label] += 1;
    }

    const sorted = [...durationsSecs].sort((a, b) => a - b);
    const round = (n: number) => Math.round(n * 10) / 10;

    return {
        sampleCount: sorted.length,
        p50Secs: round(percentile(sorted, 50)),
        p90Secs: round(percentile(sorted, 90)),
        p95Secs: round(percentile(sorted, 95)),
        p99Secs: round(percentile(sorted, 99)),
        maxSecs: round(sorted.length ? sorted[sorted.length - 1] : 0),
        histogram,
    };
}

// ── Error clustering ───────────────────────────────────────────────────────

/**
 * Collapse a raw error string to a stable signature for clustering: lower-case,
 * strip quoted spans (which may carry transcript/PII), then replace ids and
 * numbers with placeholders so "failed after 3 retries" and "failed after 7
 * retries" cluster together. Truncated so a stray stack frame can't bloat it.
 */
export function normalizeErrorSignature(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/["'`][^"'`]*["'`]/g, '"…"')
        .replace(/\b[0-9a-f]{8,}\b/g, "<id>")
        .replace(/\d+(\.\d+)?/g, "<n>")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
}

const FAILED_CAPTURE_STATUSES = new Set<CaptureStatus>([
    "transcribe_failed",
    "validate_failed",
    "analyze_failed",
    "profile_failed",
]);

export type ErrorCluster = {
    signature: string;
    count: number;
    source: "capture" | "session";
};

export type ErrorClusters = {
    failedCaptures: number;
    failedSessions: number;
    clusters: ErrorCluster[];
};

export function aggregateErrors(
    captures: CaptureType[],
    sessions: SessionType[],
): ErrorClusters {
    const captureSigs = new Map<string, number>();
    const sessionSigs = new Map<string, number>();
    let failedCaptures = 0;
    let failedSessions = 0;

    for (const c of captures) {
        if (!FAILED_CAPTURE_STATUSES.has(c.status)) continue;
        failedCaptures += 1;
        const sig = normalizeErrorSignature(c.error || c.status);
        captureSigs.set(sig, (captureSigs.get(sig) ?? 0) + 1);
    }
    for (const s of sessions) {
        if (s.processingStatus !== "failed") continue;
        failedSessions += 1;
        const sig = normalizeErrorSignature(
            s.processingError || s.processingStage || "unknown",
        );
        sessionSigs.set(sig, (sessionSigs.get(sig) ?? 0) + 1);
    }

    const clusters: ErrorCluster[] = [
        ...[...captureSigs].map(
            ([signature, count]): ErrorCluster => ({
                signature,
                count,
                source: "capture",
            }),
        ),
        ...[...sessionSigs].map(
            ([signature, count]): ErrorCluster => ({
                signature,
                count,
                source: "session",
            }),
        ),
    ].sort((a, b) => b.count - a.count);

    return { failedCaptures, failedSessions, clusters };
}

// ── Usage & retention cohorts ──────────────────────────────────────────────

export type Cohorts = {
    totalUsers: number;
    onboardingComplete: number;
    fullAccess: number;
    activeLast7d: number;
    activeLast30d: number;
    signupsByWeek: Array<{ week: string; count: number }>;
    capturesByDay: Array<{ day: string; count: number }>;
    sessionsByDay: Array<{ day: string; count: number }>;
    capturesInWindow: number;
    sessionsInWindow: number;
};

function isoDay(iso: string): string {
    return iso.slice(0, 10);
}

/** ISO week-ish bucket: the Monday-anchored date of the signup's week. */
function isoWeek(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "unknown";
    const day = (d.getUTCDay() + 6) % 7; // Mon=0
    const monday = new Date(d.getTime() - day * DAY_MS);
    return monday.toISOString().slice(0, 10);
}

function countByKey<T>(
    rows: T[],
    key: (r: T) => string | null,
): Map<string, number> {
    const m = new Map<string, number>();
    for (const r of rows) {
        const k = key(r);
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
}

export function aggregateCohorts(
    users: UserProfileType[],
    captures: CaptureType[],
    sessions: SessionType[],
): Cohorts {
    const now = Date.now();
    let onboardingComplete = 0;
    let fullAccess = 0;
    let activeLast7d = 0;
    let activeLast30d = 0;

    for (const u of users) {
        if (u.onboardingComplete) onboardingComplete += 1;
        if (u.hasFullAccess) fullAccess += 1;
        if (u.agentLastSeenAt) {
            const ageMs = now - new Date(u.agentLastSeenAt).getTime();
            if (Number.isFinite(ageMs)) {
                if (ageMs <= 7 * DAY_MS) activeLast7d += 1;
                if (ageMs <= 30 * DAY_MS) activeLast30d += 1;
            }
        }
    }

    const signups = countByKey(users, (u) =>
        u.createdAt ? isoWeek(u.createdAt) : null,
    );
    const capturesByDay = countByKey(captures, (c) =>
        c.uploadedAt ? isoDay(c.uploadedAt) : null,
    );
    const sessionsByDay = countByKey(sessions, (s) =>
        s.createdAt ? isoDay(s.createdAt) : null,
    );

    const signupsByWeek = [...signups]
        .map(([week, count]) => ({ week, count }))
        .sort((a, b) => a.week.localeCompare(b.week));
    const capturesByDayArr = [...capturesByDay]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day));
    const sessionsByDayArr = [...sessionsByDay]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day));

    return {
        totalUsers: users.length,
        onboardingComplete,
        fullAccess,
        activeLast7d,
        activeLast30d,
        signupsByWeek,
        capturesByDay: capturesByDayArr,
        sessionsByDay: sessionsByDayArr,
        capturesInWindow: captures.length,
        sessionsInWindow: sessions.length,
    };
}
