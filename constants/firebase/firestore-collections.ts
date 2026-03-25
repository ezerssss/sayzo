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
} as const;
