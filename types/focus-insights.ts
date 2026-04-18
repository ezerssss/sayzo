/**
 * Fixed backbone categories used to classify focus themes. Stable across users
 * so progress on a single category can be tracked over time even as the
 * theme's surface wording changes. Kept broad on purpose — the theme
 * `title` itself carries the specifics.
 */
export type FocusThemeCategory =
    | "clarity"
    | "directness"
    | "structure"
    | "delivery"
    | "precision"
    | "engagement";

export type FocusThemeTrend = "new" | "improving" | "stable" | "regressing";

export type FocusThemeConfidence = "low" | "medium" | "high";

/**
 * One concrete moment that backs a focus theme. Points at a session or
 * capture doc so the UI can deep-link into the exact source.
 */
export type FocusEvidence = {
    source: "session" | "capture";
    sourceId: string;
    sourceTitle: string;
    createdAt: string;
    /** Short quote or paraphrase from the transcript grounding the theme. */
    quote: string;
    /** One line describing what happened in this moment. */
    note: string;
};

/**
 * A single area the user should work on. Written as plain-language behavior
 * (not a linguistic category), paired with concrete evidence, trend, and a
 * specific next step.
 */
export type FocusTheme = {
    /**
     * Stable identifier. Backbone themes use the category slug (e.g., `"clarity"`).
     * Emergent themes use a snake_case slug of the title (e.g., `"overuses_basically"`).
     * Used to diff across regenerations so trends stay stable.
     */
    id: string;
    /** Plain-language behavior, second person. e.g. "You soften your point before making it." */
    title: string;
    /** One-line cost for the listener / goal / professional impact. */
    cost: string;
    /** One concrete action the user can take next time. */
    nudge: string;
    category: FocusThemeCategory;
    /** True for user-specific patterns discovered in this user's data, outside the backbone. */
    isEmergent: boolean;
    /**
     * Short metadata phrase for the frequency footer. No trailing period, no
     * clinical wording. e.g. "Seen in 8 of 12 sessions, 3 captures" or
     * "Across your last 4 drills".
     */
    frequencySummary: string;
    trend: FocusThemeTrend;
    /** Plain-language trend line, e.g. "Less often in your last 4 drills." or "New pattern this week." */
    trendSummary: string;
    /** 2-5 specific moments backing this theme. */
    evidence: FocusEvidence[];
    confidence: FocusThemeConfidence;
};

/**
 * Something the user used to do that has faded — shown to give a sense of
 * progress alongside the themes to work on.
 */
export type FocusWin = {
    /** Plain-language statement of what has improved. */
    statement: string;
    /** Last instance of the behavior (optional). */
    lastSeen?: FocusEvidence;
};

/**
 * Aggregated coaching view per user. One doc per uid in
 * `user-focus-insights/{uid}`. Regenerated server-side when newer sessions
 * or captures are available than those that informed the current snapshot.
 */
export type UserFocusInsights = {
    uid: string;
    /** Ranked top themes to focus on (typically 3-5). Always non-empty when data is sufficient. */
    themes: FocusTheme[];
    /** Progress signals — things that used to appear and don't anymore, or appear less. */
    wins: FocusWin[];
    /** 2-4 sentence narrative summary, plain language. */
    overview: string;
    /** `true` when data is too thin to produce themes yet. Drives empty state. */
    insufficientData: boolean;
    sessionsConsidered: number;
    capturesConsidered: number;
    /** Newest session id considered — used to detect staleness. Empty string when no sessions used. */
    lastSessionId: string;
    /** Newest capture id considered — used to detect staleness. Empty string when no captures used. */
    lastCaptureId: string;
    generatedAt: string;
    updatedAt: string;
    /** Schema version for future migrations. */
    version: number;
};

export const FOCUS_INSIGHTS_VERSION = 1;
