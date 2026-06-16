export enum FirestoreCollectionName {
    USERS = "users",
    SESSIONS = "sessions",
    CAPTURES = "captures",
    /** Focus dashboard projection. Folds into `learner-models` in Phase 3. */
    USER_FOCUS_INSIGHTS = "user-focus-insights",
    /**
     * Merged per-user coaching model — replaces the old `skill-memories`
     * collection plus the `users/*` internal-context fields. Server-only
     * (admin read, no client write). Phase 3 folds `user-focus-insights` in too.
     */
    LEARNER_MODELS = "learner-models",
    AUTH_SESSIONS = "auth_sessions",
    AUTH_CODES = "auth_codes",
    REFRESH_TOKENS = "refresh_tokens",
    ACCESS_REQUESTS = "access_requests",
    SUPPORT_REPORTS = "support_reports",
    SUPPORT_REPORTS_RATE = "support_reports_rate",
    AUDIT_LOG = "audit_log",
    /**
     * Diagnostic logs uploaded by the desktop companion. Server-only (admin read,
     * no client write). PII/content-free; auto-pruned (see lib/diagnostics/retention.ts).
     */
    DIAGNOSTIC_LOGS = "diagnostic_logs",
    /**
     * User reactions (thumbs up/down + optional reason) on coaching output.
     * Owner-readable (renders current state) + admin read; server is the only
     * writer via POST /api/reactions. See schemas/feedback/item-reaction.ts.
     */
    ITEM_REACTIONS = "item_reactions",
    /**
     * Per-call LLM/ASR/TTS telemetry + quality outcomes + prompt-version hash.
     * Server-only (admin read, no client write). Content-free (no transcript).
     * See schemas/metrics/llm-event.ts.
     */
    LLM_EVENTS = "llm_events",
    /**
     * Daily pre-aggregated metric counters over `llm_events`. Server-only
     * (admin read, no client write). See schemas/metrics/metric-rollup.ts.
     */
    METRIC_ROLLUPS = "metric_rollups",
    /**
     * In-app admin alerts raised when a monitored rate crosses threshold.
     * Server-only (admin read, no client write). See schemas/metrics/admin-alert.ts.
     */
    ADMIN_ALERTS = "admin_alerts",
}

export const FirestoreCollections = {
    users: {
        path: FirestoreCollectionName.USERS,
    },
    sessions: {
        path: FirestoreCollectionName.SESSIONS,
    },
    captures: {
        path: FirestoreCollectionName.CAPTURES,
    },
    userFocusInsights: {
        path: FirestoreCollectionName.USER_FOCUS_INSIGHTS,
    },
    learnerModels: {
        path: FirestoreCollectionName.LEARNER_MODELS,
    },
    authSessions: {
        path: FirestoreCollectionName.AUTH_SESSIONS,
    },
    authCodes: {
        path: FirestoreCollectionName.AUTH_CODES,
    },
    refreshTokens: {
        path: FirestoreCollectionName.REFRESH_TOKENS,
    },
    accessRequests: {
        path: FirestoreCollectionName.ACCESS_REQUESTS,
    },
    supportReports: {
        path: FirestoreCollectionName.SUPPORT_REPORTS,
    },
    supportReportsRate: {
        path: FirestoreCollectionName.SUPPORT_REPORTS_RATE,
    },
    auditLog: {
        path: FirestoreCollectionName.AUDIT_LOG,
    },
    diagnosticLogs: {
        path: FirestoreCollectionName.DIAGNOSTIC_LOGS,
    },
    itemReactions: {
        path: FirestoreCollectionName.ITEM_REACTIONS,
    },
    llmEvents: {
        path: FirestoreCollectionName.LLM_EVENTS,
    },
    metricRollups: {
        path: FirestoreCollectionName.METRIC_ROLLUPS,
    },
    adminAlerts: {
        path: FirestoreCollectionName.ADMIN_ALERTS,
    },
} as const;
