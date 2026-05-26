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
} as const;
