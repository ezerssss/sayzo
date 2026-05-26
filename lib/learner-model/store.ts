import "server-only";

import {
    FirestoreCollections,
    createEmptyLearnerModel,
    type LearnerModel,
} from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";

type Db = ReturnType<typeof getAdminFirestore>;

/** The `learner-models/{uid}` document reference (server-only collection). */
export function learnerModelDoc(db: Db, uid: string) {
    return db.collection(FirestoreCollections.learnerModels.path).doc(uid);
}

/**
 * Coerce a raw Firestore document (or null) into a complete `LearnerModel`,
 * filling defaults for any missing field. Mirrors the defensive hydration the
 * old `skill-memories` reader did, now for the merged doc.
 */
export function hydrateLearnerModel(uid: string, data: unknown): LearnerModel {
    const d = (data ?? {}) as Partial<LearnerModel>;
    const empty = createEmptyLearnerModel(uid, new Date().toISOString());
    return {
        ...empty,
        uid,
        trackedPatterns: Array.isArray(d.trackedPatterns)
            ? d.trackedPatterns
            : [],
        strengths: Array.isArray(d.strengths) ? d.strengths : [],
        weaknesses: Array.isArray(d.weaknesses) ? d.weaknesses : [],
        masteredFocus: Array.isArray(d.masteredFocus) ? d.masteredFocus : [],
        reinforcementFocus: Array.isArray(d.reinforcementFocus)
            ? d.reinforcementFocus
            : [],
        context: {
            drillNotes: d.context?.drillNotes ?? "",
            realWorldNotes: d.context?.realWorldNotes ?? "",
            deliveryNotes: d.context?.deliveryNotes ?? "",
        },
        lastProcessedSessionId:
            typeof d.lastProcessedSessionId === "string"
                ? d.lastProcessedSessionId
                : null,
        lastLearnerContextSessionId:
            typeof d.lastLearnerContextSessionId === "string"
                ? d.lastLearnerContextSessionId
                : "",
        lastCaptureContextCaptureId:
            typeof d.lastCaptureContextCaptureId === "string"
                ? d.lastCaptureContextCaptureId
                : "",
        schemaVersion:
            typeof d.schemaVersion === "number"
                ? d.schemaVersion
                : empty.schemaVersion,
        createdAt:
            typeof d.createdAt === "string" ? d.createdAt : empty.createdAt,
        updatedAt:
            typeof d.updatedAt === "string" ? d.updatedAt : empty.updatedAt,
    };
}

/** Read the model, or `null` when the doc doesn't exist yet. */
export async function getLearnerModel(
    db: Db,
    uid: string,
): Promise<LearnerModel | null> {
    const snap = await learnerModelDoc(db, uid).get();
    if (!snap.exists) return null;
    return hydrateLearnerModel(uid, snap.data());
}

/** Read the model, hydrating an empty one in memory when the doc is absent. */
export async function getOrHydrateLearnerModel(
    db: Db,
    uid: string,
): Promise<LearnerModel> {
    const snap = await learnerModelDoc(db, uid).get();
    return hydrateLearnerModel(uid, snap.exists ? snap.data() : null);
}

/**
 * Merge a partial update into the model doc, stamping `updatedAt`. Creates the
 * doc if missing (with required scaffolding) so writers don't have to branch.
 */
export async function updateLearnerModel(
    db: Db,
    uid: string,
    patch: Partial<LearnerModel>,
): Promise<void> {
    const now = new Date().toISOString();
    const snap = await learnerModelDoc(db, uid).get();
    if (snap.exists) {
        await learnerModelDoc(db, uid).set(
            { ...patch, updatedAt: now },
            { merge: true },
        );
        return;
    }
    const base = createEmptyLearnerModel(uid, now);
    await learnerModelDoc(db, uid).set({ ...base, ...patch, updatedAt: now });
}
