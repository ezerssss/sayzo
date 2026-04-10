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
    authSessions: {
        path: FirestoreCollectionName.AUTH_SESSIONS,
    },
    authCodes: {
        path: FirestoreCollectionName.AUTH_CODES,
    },
    refreshTokens: {
        path: FirestoreCollectionName.REFRESH_TOKENS,
    },
} as const;
