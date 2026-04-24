import { FirestoreCollectionName } from "@/enums/firebase";

export const FirestoreCollections = {
    users: {
        path: FirestoreCollectionName.USERS,
    },
    skillMemories: {
        path: FirestoreCollectionName.SKILL_MEMORIES,
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
} as const;
