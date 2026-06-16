import "server-only";

import { FirestoreCollections } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { LlmEvent, LlmQualityOutcome } from "@/schemas";

/**
 * Handle returned by `writeLlmEvent` so a later post-processing step can patch
 * the quality outcomes onto the SAME event doc (the finalizer pattern).
 */
export type LlmEventHandle = {
    finalize: (patch: { qualityOutcomes?: LlmQualityOutcome[] }) => void;
};

const NOOP_HANDLE: LlmEventHandle = { finalize: () => {} };

/**
 * Fire-and-forget write of one telemetry event. NEVER awaited on the user path
 * and NEVER throws — a Firestore hiccup must not break analysis (same stance as
 * `writeAudit`/`logFabricationTelemetry`). Returns a handle whose `finalize`
 * patches the quality outcomes onto the same doc once they're computed.
 */
export function writeLlmEvent(event: LlmEvent): LlmEventHandle {
    try {
        const db = getAdminFirestore();
        const ref = db.collection(FirestoreCollections.llmEvents.path).doc();
        // Keep the create promise so finalize can chain off it. `set` and a bare
        // `update` are independent un-ordered commits — the update can reach the
        // backend before the create and reject NOT_FOUND, silently dropping the
        // quality outcomes. Chaining guarantees create-then-patch ordering.
        const setP = ref
            .set(event)
            .catch((e) => console.warn("[llm-event] write failed", e));

        return {
            finalize: ({ qualityOutcomes }) => {
                if (!qualityOutcomes || qualityOutcomes.length === 0) return;
                void setP
                    .then(() => ref.update({ qualityOutcomes }))
                    .catch((e) =>
                        console.warn("[llm-event] finalize failed", e),
                    );
            },
        };
    } catch (e) {
        console.warn("[llm-event] init failed", e);
        return NOOP_HANDLE;
    }
}
