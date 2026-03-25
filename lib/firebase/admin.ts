import "server-only";

import {
    type App,
    type ServiceAccount,
    applicationDefault,
    cert,
    getApps,
    initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin for Next.js route handlers, Server Actions, and other server-only code.
 * Never import this file from client components.
 *
 * Credentials (pick one):
 * - FIREBASE_SERVICE_ACCOUNT_JSON: full service account JSON as a single-line string (good for Vercel).
 * - GOOGLE_APPLICATION_CREDENTIALS: path to the downloaded .json file (common for local dev).
 */
export function getFirebaseAdminApp(): App {
    const existing = getApps()[0];
    if (existing) {
        return existing;
    }

    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (rawJson) {
        let serviceAccount: ServiceAccount;
        try {
            serviceAccount = JSON.parse(rawJson) as ServiceAccount;
        } catch {
            throw new Error(
                "FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON.",
            );
        }
        return initializeApp({
            credential: cert(serviceAccount),
        });
    }

    try {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        return initializeApp({
            credential: applicationDefault(),
            ...(projectId ? { projectId } : {}),
        });
    } catch {
        throw new Error(
            "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in .env.local, " +
                "or set GOOGLE_APPLICATION_CREDENTIALS to the path of your service account JSON file.",
        );
    }
}

export function getAdminFirestore() {
    return getFirestore(getFirebaseAdminApp());
}
