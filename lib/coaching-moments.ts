import type { SessionFeedbackType } from "@/types/sessions";

export type CoachingSectionKey =
    | "momentsToTighten"
    | "structureAndFlow"
    | "clarityAndConciseness"
    | "relevanceAndFocus"
    | "engagement"
    | "professionalism"
    | "deliveryAndProsody";

export const COACHING_SECTION_ORDER: CoachingSectionKey[] = [
    "momentsToTighten",
    "structureAndFlow",
    "clarityAndConciseness",
    "relevanceAndFocus",
    "engagement",
    "professionalism",
    "deliveryAndProsody",
];

export const COACHING_SECTION_LABELS: Record<CoachingSectionKey, string> = {
    momentsToTighten: "Tighten",
    structureAndFlow: "Structure",
    clarityAndConciseness: "Clarity",
    relevanceAndFocus: "Relevance",
    engagement: "Engagement",
    professionalism: "Professionalism",
    deliveryAndProsody: "Voice & tone",
};

export type CoachingMoment = {
    id: string;
    sourceKey: CoachingSectionKey;
    timestampSeconds: number | null;
    timestampLabel: string | null;
    /** Anchor text after the timestamp link — the quote / what was said. */
    anchor: string;
    why: string | null;
    betterOption: string | null;
    keyTakeaway: string | null;
};

export type ParsedCoachingSection = {
    key: CoachingSectionKey;
    /** Markdown text before the first top-level list item (dimension gist). */
    gist: string;
    moments: CoachingMoment[];
};

function parseMomentBlock(
    key: CoachingSectionKey,
    block: string[],
    index: number,
): CoachingMoment {
    const firstLine = (block[0] ?? "").replace(/^- /, "");

    const tsPattern =
        /^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\(time:(\d+(?:\.\d+)?)\)\s*/;
    const tsMatch = tsPattern.exec(firstLine);
    let timestampSeconds: number | null = null;
    let timestampLabel: string | null = null;
    let anchorText = firstLine;

    if (tsMatch) {
        timestampLabel = tsMatch[1] ?? null;
        timestampSeconds = Number(tsMatch[2]);
        anchorText = firstLine.slice(tsMatch[0].length).trim();
    }

    let why: string | null = null;
    let betterOption: string | null = null;
    let keyTakeaway: string | null = null;

    // Accumulate continuation lines into current field.
    let current: "why" | "betterOption" | "keyTakeaway" | null = null;
    const append = (value: string) => {
        if (current === "why") why = `${why ?? ""} ${value}`.trim();
        else if (current === "betterOption")
            betterOption = `${betterOption ?? ""} ${value}`.trim();
        else if (current === "keyTakeaway")
            keyTakeaway = `${keyTakeaway ?? ""} ${value}`.trim();
    };

    for (let i = 1; i < block.length; i++) {
        const raw = block[i] ?? "";
        const trimmed = raw.trim();
        if (!trimmed) {
            current = null;
            continue;
        }
        if (trimmed.startsWith("- ")) {
            const rest = trimmed.slice(2);
            const labelPattern = /^\*\*([^*]+?):\*\*\s*(.*)$/;
            const labelMatch = labelPattern.exec(rest);
            if (!labelMatch) {
                current = null;
                continue;
            }
            const label = (labelMatch[1] ?? "").trim().toLowerCase();
            const content = (labelMatch[2] ?? "").trim();
            if (
                label.startsWith("why to tighten") ||
                label.startsWith("why this is an issue") ||
                label.startsWith("why this matters") ||
                label === "why"
            ) {
                why = content;
                current = "why";
            } else if (
                label.startsWith("better option") ||
                label.startsWith("better structure") ||
                label.startsWith("better phrasing") ||
                label.startsWith("better")
            ) {
                betterOption = content;
                current = "betterOption";
            } else if (label.startsWith("key takeaway")) {
                keyTakeaway = content;
                current = "keyTakeaway";
            } else {
                current = null;
            }
        } else if (current) {
            append(trimmed);
        }
    }

    const id = `${key}-${index}-${timestampSeconds ?? "na"}`;

    return {
        id,
        sourceKey: key,
        timestampSeconds,
        timestampLabel,
        anchor: anchorText,
        why,
        betterOption,
        keyTakeaway,
    };
}

export function parseCoachingSection(
    key: CoachingSectionKey,
    markdown: string | null | undefined,
): ParsedCoachingSection {
    const text = typeof markdown === "string" ? markdown : "";
    if (!text.trim()) return { key, gist: "", moments: [] };

    const lines = text.split("\n");
    let firstBulletIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^- /.test(lines[i] ?? "")) {
            firstBulletIdx = i;
            break;
        }
    }

    if (firstBulletIdx === -1) {
        return { key, gist: text.trim(), moments: [] };
    }

    const gist = lines.slice(0, firstBulletIdx).join("\n").trim();

    const moments: CoachingMoment[] = [];
    let current: string[] = [];

    for (let i = firstBulletIdx; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (/^- /.test(line)) {
            if (current.length) {
                moments.push(
                    parseMomentBlock(key, current, moments.length),
                );
            }
            current = [line];
        } else if (current.length) {
            current.push(line);
        }
    }
    if (current.length) {
        moments.push(parseMomentBlock(key, current, moments.length));
    }

    return { key, gist, moments };
}

export function parseAllCoachingSections(
    feedback: SessionFeedbackType,
): ParsedCoachingSection[] {
    return COACHING_SECTION_ORDER.map((key) =>
        parseCoachingSection(key, feedback[key] as string | null | undefined),
    ).filter((section) => section.gist || section.moments.length > 0);
}

export type GroupedMoment = {
    key: string;
    timestampSeconds: number | null;
    timestampLabel: string | null;
    anchor: string;
    occurrences: CoachingMoment[];
    /** Unique set of dimension section keys this moment appears in. */
    dimensions: CoachingSectionKey[];
};

/**
 * Group moments sharing the same timestamp across dimensions so the reader
 * sees one card per moment with tags for each dimension it touches.
 * Untimed moments (no transcript timestamp) are kept as separate groups at the end.
 */
export function groupMomentsByTimestamp(
    sections: ParsedCoachingSection[],
): GroupedMoment[] {
    const byStamp = new Map<string, GroupedMoment>();
    const untimed: GroupedMoment[] = [];

    for (const section of sections) {
        for (const moment of section.moments) {
            if (moment.timestampSeconds == null) {
                untimed.push({
                    key: moment.id,
                    timestampSeconds: null,
                    timestampLabel: null,
                    anchor: moment.anchor,
                    occurrences: [moment],
                    dimensions: [moment.sourceKey],
                });
                continue;
            }
            const k = moment.timestampSeconds.toFixed(2);
            const existing = byStamp.get(k);
            if (existing) {
                existing.occurrences.push(moment);
                if (!existing.dimensions.includes(moment.sourceKey)) {
                    existing.dimensions.push(moment.sourceKey);
                }
                // Prefer a longer / richer anchor text when available.
                if (moment.anchor.length > existing.anchor.length) {
                    existing.anchor = moment.anchor;
                }
            } else {
                byStamp.set(k, {
                    key: k,
                    timestampSeconds: moment.timestampSeconds,
                    timestampLabel: moment.timestampLabel,
                    anchor: moment.anchor,
                    occurrences: [moment],
                    dimensions: [moment.sourceKey],
                });
            }
        }
    }

    const timed = [...byStamp.values()].sort(
        (a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0),
    );
    return [...timed, ...untimed];
}

/**
 * Pick the top N moments for the "fix these first" card. We prefer bullets
 * that came from `momentsToTighten` (the prompt marks those as highest-impact)
 * and preserve that field's ordering.
 */
export function pickTopFixes(
    sections: ParsedCoachingSection[],
    max = 3,
): CoachingMoment[] {
    const moments = sections.find((s) => s.key === "momentsToTighten")?.moments;
    if (!moments || moments.length === 0) return [];
    return moments.slice(0, max);
}
