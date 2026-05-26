import "server-only";

import type { DifferentialContext } from "@/schemas";

const MS_PER_DAY = 86_400_000;

/**
 * Formats the differential history into the two prompt blocks BOTH analyzers
 * inject: the learner's tracked habits (with server-owned trend/recency) and
 * the recent same-modality `mainIssue` headlines. Shared so the drill and
 * capture analyzers render this identically and can't drift apart.
 */
export function formatDifferentialBlocks(differential: DifferentialContext): {
    trackedBlock: string;
    recentIssuesBlock: string;
} {
    const trackedBlock = differential.trackedPatterns.length
        ? differential.trackedPatterns
              .map((p) => {
                  const t = Date.parse(p.lastSeenAt);
                  const days = Number.isFinite(t)
                      ? Math.max(0, Math.round((Date.now() - t) / MS_PER_DAY))
                      : 0;
                  return `- (${p.kind}, ${p.trend}, seen ${p.occurrences}×, last ${days}d ago) ${p.label}`;
              })
              .join("\n")
        : "(none yet)";
    const recentIssuesBlock = differential.recentMainIssues.length
        ? differential.recentMainIssues
              .map((r, i) => `${i + 1}. ${r.mainIssue}`)
              .join("\n")
        : "(none yet)";
    return { trackedBlock, recentIssuesBlock };
}
