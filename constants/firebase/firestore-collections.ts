import { FirestoreCollectionName } from "@/enums/firebase";

export const FirestoreCollections = {
    users: {
        path: FirestoreCollectionName.USERS,
    },
} as const;
