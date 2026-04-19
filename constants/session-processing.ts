/**
 * How long a session can stay in `processingStatus: "processing"` without
 * its `processingUpdatedAt` moving before we treat it as stuck. The complete
 * handler refreshes `processingUpdatedAt` at every stage transition, so any
 * gap longer than this means the backend almost certainly died mid-request.
 */
export const STALE_PROCESSING_MS = 90_000;

export function isStaleProcessing(
    processingUpdatedAt: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (!processingUpdatedAt) return false;
    const t = Date.parse(processingUpdatedAt);
    if (!Number.isFinite(t)) return false;
    return now - t > STALE_PROCESSING_MS;
}
