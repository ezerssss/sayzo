import type {
    FocusThemeConfidence,
    LlmTrackedPattern,
    TrackedPattern,
} from "@/schemas";

/** Salience cap — more than this and the analyzer prompt drowns in history. */
const MAX_TRACKED_PATTERNS = 12;

function confidenceFor(occurrences: number): FocusThemeConfidence {
    if (occurrences >= 4) return "high";
    if (occurrences >= 2) return "medium";
    return "low";
}

/**
 * Merge LLM-proposed patterns into the stored set. The LLM proposes only
 * `{id, label, category, kind}`; the SERVER owns `trend` / `lastSeenAt` /
 * `lastSeenSourceId` / `occurrences` / `confidence` so the model can't
 * hallucinate progress (same anti-hallucination principle as the anchor
 * resolver owning `transcriptIdx`).
 *
 * - **matched id** (re-surfaced this item) → bump `occurrences`, refresh
 *   `lastSeen*`, recompute `confidence`, and set `trend`: a re-surfaced weakness
 *   is `"stable"` (it's persisting), a re-surfaced strength is `"improving"`.
 * - **stored pattern not in this round** → left as-is (no aggressive fade in
 *   Phase 2; the Phase 3 focus synthesizer handles win/fade nuance).
 * - **new incoming id** → `trend: "new"`, `occurrences: 1`, `confidence: "low"`.
 *
 * Result is capped at `MAX_TRACKED_PATTERNS`, most-recently-seen first.
 */
export function mergeTrackedPatterns(
    current: TrackedPattern[],
    incoming: LlmTrackedPattern[],
    sourceId: string,
    nowIso: string,
): TrackedPattern[] {
    const byId = new Map<string, TrackedPattern>(
        current.map((p) => [p.id, p]),
    );

    // Guard against the LLM emitting the same id twice in one response — only
    // the first occurrence counts, so we don't double-bump `occurrences`.
    const seenThisRound = new Set<string>();
    for (const inc of incoming) {
        const id = inc.id.trim();
        const label = inc.label.trim();
        if (!id || !label) continue;
        if (seenThisRound.has(id)) continue;
        seenThisRound.add(id);
        const existing = byId.get(id);
        if (existing) {
            const occurrences = existing.occurrences + 1;
            byId.set(id, {
                ...existing,
                label,
                category: inc.category,
                kind: inc.kind,
                occurrences,
                lastSeenAt: nowIso,
                lastSeenSourceId: sourceId,
                // strength→weakness flip = regressing; anything now a strength
                // = improving; a persisting weakness = stable.
                trend:
                    existing.kind === "strength" && inc.kind === "weakness"
                        ? "regressing"
                        : inc.kind === "strength"
                          ? "improving"
                          : "stable",
                confidence: confidenceFor(occurrences),
            });
        } else {
            byId.set(id, {
                id,
                label,
                category: inc.category,
                kind: inc.kind,
                trend: "new",
                lastSeenAt: nowIso,
                lastSeenSourceId: sourceId,
                occurrences: 1,
                confidence: "low",
            });
        }
    }

    return Array.from(byId.values())
        .sort((a, b) => {
            // Valid total order. Cap-survival priority: durable history
            // (more occurrences) beats one-off new patterns, then most recent,
            // then id as a stable tiebreaker — so a flood of new ids in one
            // round can't evict long-tracked high-confidence habits.
            if (b.occurrences !== a.occurrences)
                return b.occurrences - a.occurrences;
            if (a.lastSeenAt !== b.lastSeenAt)
                return a.lastSeenAt < b.lastSeenAt ? 1 : -1;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        })
        .slice(0, MAX_TRACKED_PATTERNS);
}
