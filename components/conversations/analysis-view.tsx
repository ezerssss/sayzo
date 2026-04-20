"use client";

import { ChevronDown, Play, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
    TurnRewriteCard,
    VerdictPill,
} from "@/components/conversations/turn-rewrite-card";
import { FeedbackChat } from "@/components/session/feedback-chat";
import { InlineMarkdown } from "@/components/session/inline-markdown";
import { stitchTurnRewrites } from "@/lib/captures/rewrites";
import { cn } from "@/lib/utils";
import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
    CoachingMoment,
    DimensionalAnalysis,
    StructuralObservation,
    TeachableMoment,
    TeachableMomentSeverity,
    TurnRewrite,
} from "@/types/captures";

type Props = {
    analysis: CaptureAnalysis;
    /** Speaker-tagged transcript; used by the Rewrites section to resolve
     *  per-turn timestamps and "Turn N" numbering. */
    transcript?: CaptureTranscriptLine[];
    onSeekToSecond?: (seconds: number) => void;
    /** When set, only render the specified section. When absent, render all. */
    section?: "overview" | "coaching" | "rewrites";
    /** When both provided, enables a per-section "Discuss this feedback" chat. */
    captureId?: string;
    uid?: string;
};

/**
 * Resolve the unified `whyThisMatters` narrative. New analyses populate
 * `whyThisMatters` directly; legacy analyses persisted before the schema
 * change have the old `whyIssue` + `keyTakeaway` pair that we merge on read.
 */
function resolveWhyThisMatters(moment: CoachingMoment): string {
    if (moment.whyThisMatters && moment.whyThisMatters.trim()) {
        return moment.whyThisMatters.trim();
    }
    const parts: string[] = [];
    if (moment.whyIssue?.trim()) parts.push(moment.whyIssue.trim());
    if (moment.keyTakeaway?.trim()) {
        parts.push(`**Takeaway:** ${moment.keyTakeaway.trim()}`);
    }
    return parts.join("\n\n");
}

function formatCoachingMoment(moment: CoachingMoment): string {
    const why = resolveWhyThisMatters(moment);
    return `- **What happened:** ${moment.anchor}\n  - **Better:** ${moment.betterOption}\n  - **Why this matters:** ${why}`;
}

function dimensionalToText(dim: DimensionalAnalysis): string {
    if (!dim.findings.length) return dim.assessment;
    return `${dim.assessment}\n\n**Specific findings:**\n${dim.findings.map(formatCoachingMoment).join("\n")}`;
}

function overviewToText(analysis: CaptureAnalysis): string {
    const parts = [
        `**Overview:** ${analysis.overview}`,
        `**Main issue:** ${analysis.mainIssue}`,
    ];
    if (analysis.secondaryIssues.length > 0) {
        parts.push(
            `**Secondary issues:**\n${analysis.secondaryIssues.map((s) => `- ${s}`).join("\n")}`,
        );
    }
    if (analysis.improvements.length > 0) {
        parts.push(
            `**Improvements:**\n${analysis.improvements.map((s) => `- ${s}`).join("\n")}`,
        );
    }
    if (analysis.regressions.length > 0) {
        parts.push(
            `**Regressions:**\n${analysis.regressions.map((s) => `- ${s}`).join("\n")}`,
        );
    }
    if (analysis.notes?.trim()) {
        parts.push(`**Notes:** ${analysis.notes.trim()}`);
    }
    return parts.join("\n\n");
}

function formatTeachableGroup(
    label: string,
    moments: TeachableMoment[],
): string | null {
    if (!moments.length) return null;
    return `**${label}:**\n${moments
        .map((m) => {
            const mm = Math.floor(m.timestamp / 60);
            const ss = Math.floor(m.timestamp % 60)
                .toString()
                .padStart(2, "0");
            return `**[${mm}:${ss}] ${m.type} (${m.severity})**\n${formatCoachingMoment(m)}`;
        })
        .join("\n\n")}`;
}

function coachingToText(analysis: CaptureAnalysis): string {
    const fix = getFixTheseFirst(analysis);
    const more = getMoreMoments(analysis);
    const parts: string[] = [];
    const fixChunk = formatTeachableGroup("Fix these first", fix);
    if (fixChunk) parts.push(fixChunk);
    const moreChunk = formatTeachableGroup("More moments", more);
    if (moreChunk) parts.push(moreChunk);
    const dims: Array<[string, DimensionalAnalysis]> = [
        ["Structure & Flow", analysis.structureAndFlow],
        ["Clarity & Conciseness", analysis.clarityAndConciseness],
        ["Relevance & Focus", analysis.relevanceAndFocus],
        ["Engagement", analysis.engagement],
        ["Professionalism", analysis.professionalism],
        ["Voice, Tone & Expression", analysis.voiceToneExpression],
    ];
    for (const [label, dim] of dims) {
        parts.push(`**${label}:**\n${dimensionalToText(dim)}`);
    }
    return parts.join("\n\n");
}

/**
 * Return the fix-these-first moments for the UI. New analyses populate
 * `fixTheseFirst` directly. Legacy analyses only have `teachableMoments` —
 * fall back to slicing the top 3 by severity (major → moderate → minor) so
 * old captures still get a sensible "Fix these first" list.
 */
function getFixTheseFirst(analysis: CaptureAnalysis): TeachableMoment[] {
    if (Array.isArray(analysis.fixTheseFirst) && analysis.fixTheseFirst.length) {
        return analysis.fixTheseFirst;
    }
    const legacy = analysis.teachableMoments;
    if (!Array.isArray(legacy) || legacy.length === 0) return [];
    return [...legacy]
        .sort(
            (a, b) =>
                SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
                a.timestamp - b.timestamp,
        )
        .slice(0, 3);
}

/**
 * Return the more-moments list for the UI. New analyses populate `moreMoments`
 * directly. Legacy analyses only have `teachableMoments` — fall back to
 * everything minus whatever the legacy `getFixTheseFirst` selection used.
 */
function getMoreMoments(analysis: CaptureAnalysis): TeachableMoment[] {
    if (Array.isArray(analysis.moreMoments) && analysis.moreMoments.length) {
        return analysis.moreMoments;
    }
    // If new fixTheseFirst is populated but no moreMoments, nothing else to show.
    if (
        Array.isArray(analysis.fixTheseFirst) &&
        analysis.fixTheseFirst.length > 0 &&
        !Array.isArray(analysis.moreMoments)
    ) {
        return [];
    }
    const legacy = analysis.teachableMoments;
    if (!Array.isArray(legacy) || legacy.length === 0) return [];
    const fixFirstSet = new Set(getFixTheseFirst(analysis));
    return legacy.filter((m) => !fixFirstSet.has(m));
}

function rewritesToText(analysis: CaptureAnalysis): string {
    const parts: string[] = [];
    const changed = analysis.turnRewrites.filter((t) => t.verdict !== "keep");
    if (changed.length > 0) {
        parts.push(
            `**Per-turn rewrites:**\n${changed
                .map(
                    (r) =>
                        `- [${r.verdict}] Original: "${r.original}"\n  - Rewrite: "${r.rewrite}"\n  - Note: ${r.note ?? ""}`,
                )
                .join("\n")}`,
        );
    }
    if (analysis.structuralObservations.length > 0) {
        parts.push(
            `**Structural observations:**\n${analysis.structuralObservations
                .map(
                    (o) =>
                        `- ${o.observation}\n  - ${o.explanation}\n  - Turns: ${o.affectedTurnIdxs.join(", ")}`,
                )
                .join("\n")}`,
        );
    }
    const stitched = stitchTurnRewrites(analysis.turnRewrites).trim();
    if (stitched) {
        parts.push(`**Full rewrite (stitched):**\n${stitched}`);
    }
    return parts.join("\n\n");
}

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

const SEVERITY_RANK: Record<TeachableMomentSeverity, number> = {
    major: 0,
    moderate: 1,
    minor: 2,
};

function CollapsibleCard({
    title,
    subtitle,
    defaultOpen = false,
    children,
}: {
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="rounded-2xl border border-border/70 bg-background">
            <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-5 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <span className="text-sm font-semibold tracking-tight">
                    {title}
                </span>
                <span className="flex items-center gap-2">
                    {subtitle ? (
                        <span className="text-xs text-muted-foreground">
                            {subtitle}
                        </span>
                    ) : null}
                    <ChevronDown
                        className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            open && "rotate-180",
                        )}
                    />
                </span>
            </button>
            {open && (
                <div className="space-y-4 border-t border-border/50 p-5">
                    {children}
                </div>
            )}
        </div>
    );
}

function TimestampChip({
    seconds,
    onSeek,
}: {
    seconds: number;
    onSeek?: (seconds: number) => void;
}) {
    const label = formatTimestamp(seconds);
    if (!onSeek) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                {label}
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={() => onSeek(seconds)}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted/80"
            title={`Seek to ${label}`}
        >
            <Play className="size-3" />
            {label}
        </button>
    );
}

function TypeChip({ type }: { type: string }) {
    return (
        <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {type}
        </span>
    );
}

function SeverityChip({ severity }: { severity: TeachableMomentSeverity }) {
    const cls =
        severity === "major"
            ? "bg-red-100 text-red-700"
            : severity === "moderate"
              ? "bg-amber-100 text-amber-700"
              : "bg-muted text-muted-foreground";
    return (
        <span
            className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                cls,
            )}
        >
            {severity}
        </span>
    );
}

function AnchorQuote({
    text,
    compact = false,
}: {
    text: string;
    compact?: boolean;
}) {
    const cleaned = text.trim();
    if (!cleaned) return null;
    return (
        <blockquote
            className={cn(
                "border-l-2 border-border/70 pl-3 text-foreground/90",
                compact
                    ? "text-sm leading-relaxed"
                    : "text-[15px] leading-relaxed",
            )}
        >
            {stripWrappingQuotes(cleaned)}
        </blockquote>
    );
}

function stripWrappingQuotes(input: string): string {
    const pattern = /^"([\s\S]+)"$/;
    const match = pattern.exec(input);
    return match?.[1] ?? input;
}

function TryInsteadBox({ text }: { text: string }) {
    if (!text.trim()) return null;
    return (
        <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Try instead
            </p>
            <div className="mt-1">
                <InlineMarkdown text={text} tone="body" />
            </div>
        </div>
    );
}

function CoachingMomentCard({ moment }: { moment: CoachingMoment }) {
    const [expanded, setExpanded] = useState(false);
    const why = resolveWhyThisMatters(moment);
    const hasWhy = Boolean(why);
    return (
        <div className="space-y-3 rounded-lg border border-border/50 bg-background/50 p-3">
            <AnchorQuote text={moment.anchor} compact />
            {moment.betterOption ? (
                <TryInsteadBox text={moment.betterOption} />
            ) : null}
            {hasWhy ? (
                <div>
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown
                            className={cn(
                                "size-3 transition-transform",
                                expanded && "rotate-180",
                            )}
                        />
                        {expanded ? "Hide why" : "Why this matters"}
                    </button>
                    {expanded ? (
                        <div className="mt-2">
                            <InlineMarkdown text={why} tone="small-muted" />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function DimensionalCard({
    title,
    dimension,
    chat,
}: {
    title: string;
    dimension: DimensionalAnalysis;
    chat?: ReactNode;
}) {
    return (
        <CollapsibleCard
            title={title}
            subtitle={
                dimension.findings.length > 0
                    ? dimension.findings.length === 1
                        ? "1 finding"
                        : `${dimension.findings.length} findings`
                    : undefined
            }
        >
            <p className="text-sm leading-relaxed text-muted-foreground">
                {dimension.assessment}
            </p>
            {dimension.findings.length > 0 && (
                <div className="space-y-2">
                    {dimension.findings.map((finding, i) => (
                        <CoachingMomentCard key={i} moment={finding} />
                    ))}
                </div>
            )}
            {chat}
        </CollapsibleCard>
    );
}

function TopFixesCard({
    moments,
    onSeek,
}: {
    moments: TeachableMoment[];
    onSeek?: (seconds: number) => void;
}) {
    const [open, setOpen] = useState(true);
    return (
        <div className="rounded-2xl border border-border/70 bg-background">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 p-5"
            >
                <span className="text-sm font-semibold tracking-tight">
                    Fix these first
                </span>
                <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        {moments.length === 1
                            ? "1 priority"
                            : `${moments.length} priorities`}
                    </span>
                    <ChevronDown
                        className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            open && "rotate-180",
                        )}
                    />
                </span>
            </button>
            {open ? (
                <ol className="space-y-4 border-t border-border/50 p-5">
                    {moments.map((moment, index) => (
                        <li
                            key={`${moment.timestamp}-${moment.transcriptIdx}-${index}`}
                            className="rounded-xl border border-border/70 bg-background p-4"
                        >
                            <TopFixContent
                                index={index + 1}
                                moment={moment}
                                onSeek={onSeek}
                            />
                        </li>
                    ))}
                </ol>
            ) : null}
        </div>
    );
}

function TopFixContent({
    index,
    moment,
    onSeek,
}: {
    index: number;
    moment: TeachableMoment;
    onSeek?: (seconds: number) => void;
}) {
    const why = resolveWhyThisMatters(moment);
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-medium text-white">
                    {index}
                </span>
                <TimestampChip seconds={moment.timestamp} onSeek={onSeek} />
                <TypeChip type={moment.type} />
                <SeverityChip severity={moment.severity} />
            </div>
            <AnchorQuote text={moment.anchor} />
            {moment.betterOption ? (
                <TryInsteadBox text={moment.betterOption} />
            ) : null}
            {why ? (
                <InlineMarkdown text={why} tone="small-muted" />
            ) : null}
        </div>
    );
}

function MomentsList({
    moments,
    onSeek,
}: {
    moments: TeachableMoment[];
    onSeek?: (seconds: number) => void;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background p-5">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">
                    More moments
                </h3>
                <span className="text-xs text-muted-foreground">
                    {moments.length === 1
                        ? "1 moment"
                        : `${moments.length} moments`}
                </span>
            </div>
            <ul className="mt-4 space-y-3">
                {moments.map((moment, idx) => (
                    <li
                        key={`${moment.timestamp}-${moment.transcriptIdx}-${idx}`}
                    >
                        <MoreMomentRow moment={moment} onSeek={onSeek} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function MoreMomentRow({
    moment,
    onSeek,
}: {
    moment: TeachableMoment;
    onSeek?: (seconds: number) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const why = resolveWhyThisMatters(moment);
    const hasWhy = Boolean(why);

    return (
        <div className="rounded-xl border border-border/60 bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
                <TimestampChip seconds={moment.timestamp} onSeek={onSeek} />
                <TypeChip type={moment.type} />
                <SeverityChip severity={moment.severity} />
            </div>

            <div className="mt-3">
                <AnchorQuote text={moment.anchor} compact />
            </div>

            {moment.betterOption ? (
                <div className="mt-3">
                    <TryInsteadBox text={moment.betterOption} />
                </div>
            ) : null}

            {hasWhy && (
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown
                            className={cn(
                                "size-3 transition-transform",
                                expanded && "rotate-180",
                            )}
                        />
                        {expanded ? "Hide why" : "Why this matters"}
                    </button>
                    {expanded && (
                        <div className="mt-2">
                            <InlineMarkdown text={why} tone="small-muted" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BigPicturePanel({
    dimensions,
    renderChat,
}: {
    dimensions: Array<{
        key: string;
        title: string;
        dim: DimensionalAnalysis;
    }>;
    renderChat: (
        sectionKey: string,
        sectionTitle: string,
        content: string,
    ) => ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const visible = dimensions.filter(
        (d) => d.dim.assessment.trim() || d.dim.findings.length > 0,
    );
    if (visible.length === 0) return null;

    return (
        <div className="rounded-2xl border border-border/70 bg-background">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 p-5"
            >
                <span className="text-sm font-semibold tracking-tight">
                    Big picture
                </span>
                <ChevronDown
                    className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open ? (
                <div className="space-y-3 border-t border-border/50 p-5">
                    {visible.map((d) => (
                        <DimensionalCard
                            key={d.key}
                            title={d.title}
                            dimension={d.dim}
                            chat={renderChat(
                                d.key,
                                d.title,
                                dimensionalToText(d.dim),
                            )}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** Runs of consecutive `keep` turns are folded into a single expandable row. */
type TurnGroup =
    | { kind: "single"; turn: TurnRewrite }
    | { kind: "keep-run"; turns: TurnRewrite[] };

function groupTurnRewrites(turns: TurnRewrite[]): TurnGroup[] {
    const groups: TurnGroup[] = [];
    let run: TurnRewrite[] = [];
    const flushRun = () => {
        if (run.length === 0) return;
        if (run.length >= 3) {
            groups.push({ kind: "keep-run", turns: run });
        } else {
            for (const t of run) groups.push({ kind: "single", turn: t });
        }
        run = [];
    };
    for (const t of turns) {
        if (t.verdict === "keep") {
            run.push(t);
        } else {
            flushRun();
            groups.push({ kind: "single", turn: t });
        }
    }
    flushRun();
    return groups;
}

/** Find the user-turn ordinal (1-based) for a given `transcriptIdx`. */
function userTurnNumber(
    turnRewrites: TurnRewrite[],
    transcriptIdx: number,
): number | null {
    const idx = turnRewrites.findIndex(
        (t) => t.transcriptIdx === transcriptIdx,
    );
    return idx === -1 ? null : idx + 1;
}

function StructuralNotesPanel({
    observations,
    turnRewrites,
    transcript,
    onSeekToSecond,
}: {
    observations: StructuralObservation[];
    turnRewrites: TurnRewrite[];
    transcript?: CaptureTranscriptLine[];
    onSeekToSecond?: (seconds: number) => void;
}) {
    return (
        <div className="rounded-xl border border-border/70 bg-background p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Structural notes
            </p>
            <ol className="mt-3 space-y-4">
                {observations.map((obs, i) => (
                    <li key={i} className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                            {obs.observation}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            {obs.explanation}
                        </p>
                        {obs.affectedTurnIdxs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {obs.affectedTurnIdxs.map((tIdx) => {
                                    const turnNo = userTurnNumber(
                                        turnRewrites,
                                        tIdx,
                                    );
                                    const line = transcript?.[tIdx];
                                    const label = turnNo
                                        ? `Turn ${turnNo}`
                                        : `#${tIdx}`;
                                    const canSeek =
                                        line && onSeekToSecond !== undefined;
                                    if (canSeek) {
                                        return (
                                            <button
                                                key={tIdx}
                                                type="button"
                                                onClick={() =>
                                                    onSeekToSecond!(line.start)
                                                }
                                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/80"
                                            >
                                                <Play className="size-3" />
                                                {label}
                                            </button>
                                        );
                                    }
                                    return (
                                        <span
                                            key={tIdx}
                                            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-foreground"
                                        >
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}

function RewritesSection({
    analysis,
    transcript,
    onSeekToSecond,
    renderChat,
}: {
    analysis: CaptureAnalysis;
    transcript?: CaptureTranscriptLine[];
    onSeekToSecond?: (seconds: number) => void;
    renderChat: (
        key: string,
        title: string,
        content: string,
    ) => ReactNode | null;
}) {
    const [view, setView] = useState<"turns" | "prose">("turns");
    const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set());

    const hasRewrites = analysis.turnRewrites.length > 0;
    const hasStructural = analysis.structuralObservations.length > 0;

    if (!hasRewrites && !hasStructural) {
        return (
            <div className="rounded-xl border border-border/70 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="size-4" />
                    Improved version
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    No improved version was generated for this conversation.
                    This usually means your delivery was already strong.
                </p>
            </div>
        );
    }

    const groups = groupTurnRewrites(analysis.turnRewrites);
    const stitched = stitchTurnRewrites(analysis.turnRewrites);
    const rewriteContent = rewritesToText(analysis);

    const toggleRun = (runKey: number) => {
        setExpandedRuns((prev) => {
            const next = new Set(prev);
            if (next.has(runKey)) next.delete(runKey);
            else next.add(runKey);
            return next;
        });
    };

    const seekToTurn = (transcriptIdx: number) => {
        const line = transcript?.[transcriptIdx];
        if (line && onSeekToSecond) onSeekToSecond(line.start);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5">
                <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-foreground" />
                    <h3 className="text-sm font-semibold tracking-tight">
                        How it could sound
                    </h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    Every turn you took, side by side with how a confident
                    speaker would land it. Turns already working well are
                    flagged strong.
                </p>
            </div>

            {/* View toggle */}
            {hasRewrites && (
                <div className="inline-flex rounded-lg border border-border/70 bg-background p-0.5 text-xs">
                    <button
                        type="button"
                        onClick={() => setView("turns")}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-medium transition-colors",
                            view === "turns"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        Turn-by-turn
                    </button>
                    <button
                        type="button"
                        onClick={() => setView("prose")}
                        className={cn(
                            "rounded-md px-3 py-1.5 font-medium transition-colors",
                            view === "prose"
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        Read straight through
                    </button>
                </div>
            )}

            {/* Turn-by-turn view */}
            {hasRewrites && view === "turns" && (
                <ol className="space-y-3">
                    {groups.map((group, gIdx) => {
                        if (group.kind === "keep-run") {
                            const isOpen = expandedRuns.has(gIdx);
                            return (
                                <li
                                    key={`run-${gIdx}`}
                                    className="rounded-xl border border-border/70 bg-background"
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleRun(gIdx)}
                                        className="flex w-full items-center justify-between gap-3 p-3 text-left"
                                    >
                                        <span className="flex items-center gap-2">
                                            <VerdictPill verdict="keep" />
                                            <span className="text-xs text-muted-foreground">
                                                {group.turns.length} turns
                                                already strong
                                            </span>
                                        </span>
                                        <ChevronDown
                                            className={cn(
                                                "size-4 text-muted-foreground transition-transform",
                                                isOpen && "rotate-180",
                                            )}
                                        />
                                    </button>
                                    {isOpen && (
                                        <ol className="space-y-2 border-t border-border/50 p-3">
                                            {group.turns.map((t) => {
                                                const turnNo = userTurnNumber(
                                                    analysis.turnRewrites,
                                                    t.transcriptIdx,
                                                );
                                                const line =
                                                    transcript?.[
                                                        t.transcriptIdx
                                                    ];
                                                return (
                                                    <li
                                                        key={t.transcriptIdx}
                                                        className="flex items-start gap-3 rounded-lg bg-muted/30 p-2"
                                                    >
                                                        {line &&
                                                        onSeekToSecond ? (
                                                            <TimestampChip
                                                                seconds={
                                                                    line.start
                                                                }
                                                                onSeek={
                                                                    onSeekToSecond
                                                                }
                                                            />
                                                        ) : null}
                                                        <div className="flex-1 space-y-1">
                                                            {turnNo && (
                                                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                                    Turn {turnNo}
                                                                </p>
                                                            )}
                                                            <p className="text-xs leading-relaxed text-foreground">
                                                                {t.original}
                                                            </p>
                                                            {t.note && (
                                                                <p className="text-[11px] italic leading-relaxed text-muted-foreground">
                                                                    {t.note}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    )}
                                </li>
                            );
                        }

                        const turn = group.turn;
                        const turnNo = userTurnNumber(
                            analysis.turnRewrites,
                            turn.transcriptIdx,
                        );
                        const line = transcript?.[turn.transcriptIdx];
                        return (
                            <li
                                key={turn.transcriptIdx}
                                className="rounded-xl border border-border/70 bg-background p-4"
                            >
                                <div className="flex items-center gap-2">
                                    {line && onSeekToSecond ? (
                                        <TimestampChip
                                            seconds={line.start}
                                            onSeek={onSeekToSecond}
                                        />
                                    ) : null}
                                    {turnNo && (
                                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                            Turn {turnNo}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3">
                                    <TurnRewriteCard
                                        rewrite={turn}
                                        variant="standalone"
                                        onSuggestedIdxClick={seekToTurn}
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}

            {/* Read straight through view */}
            {hasRewrites && view === "prose" && (
                <div className="rounded-xl border border-border/70 bg-background p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Read straight through
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground italic">
                        Stitched from your turns — rewrite used where a better
                        version exists, original used otherwise. Skipped lines
                        from other speakers.
                    </p>
                    <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground">
                        {stitched.split("\n\n").map((para, i) => (
                            <p key={i}>{para}</p>
                        ))}
                    </div>
                </div>
            )}

            {/* Structural observations */}
            {hasStructural && (
                <StructuralNotesPanel
                    observations={analysis.structuralObservations}
                    turnRewrites={analysis.turnRewrites}
                    transcript={transcript}
                    onSeekToSecond={onSeekToSecond}
                />
            )}

            {renderChat("rewrites", "Improved version", rewriteContent)}
        </div>
    );
}

export function AnalysisView(props: Readonly<Props>) {
    const { analysis, transcript, onSeekToSecond, section, captureId, uid } =
        props;
    const chatEnabled = Boolean(captureId && uid);

    const renderChat = (
        sectionKey: string,
        sectionTitle: string,
        content: string,
    ) => {
        if (!chatEnabled || !content.trim()) return null;
        return (
            <FeedbackChat
                source="capture"
                sourceId={captureId!}
                sectionKey={sectionKey}
                sectionTitle={sectionTitle}
                feedbackContent={content}
                onSeekToSecond={onSeekToSecond}
            />
        );
    };

    const topFixes = useMemo(() => getFixTheseFirst(analysis), [analysis]);
    const moreMoments = useMemo(() => getMoreMoments(analysis), [analysis]);

    // ── Overview section (Main tab) ──────────────────────────────────
    if (section === "overview") {
        const overviewContent = overviewToText(analysis);
        return (
            <div className="space-y-4">
                <div className="rounded-xl border border-border/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4" />
                        Overview
                    </div>
                    <div className="mt-3 rounded-lg border border-border/50 bg-background/50 p-3">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            {analysis.overview}
                        </p>
                    </div>
                    {renderChat("overview", "Overview", overviewContent)}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                        Main issue
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                        {analysis.mainIssue}
                    </p>
                    {analysis.secondaryIssues.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-amber-200/60 pt-3">
                            {analysis.secondaryIssues.map((issue, i) => (
                                <li
                                    key={i}
                                    className="text-sm leading-relaxed text-muted-foreground"
                                >
                                    <span className="mr-1.5 text-amber-700/70">
                                        &bull;
                                    </span>
                                    {issue}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {(analysis.improvements.length > 0 ||
                    analysis.regressions.length > 0) && (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Progress
                        </p>
                        {analysis.improvements.length > 0 && (
                            <div className="mt-3 space-y-1">
                                <p className="text-xs font-medium text-emerald-700">
                                    Improvements
                                </p>
                                {analysis.improvements.map((item, i) => (
                                    <p
                                        key={i}
                                        className="text-sm leading-relaxed text-muted-foreground"
                                    >
                                        <span className="text-emerald-600">
                                            +
                                        </span>{" "}
                                        {item}
                                    </p>
                                ))}
                            </div>
                        )}
                        {analysis.regressions.length > 0 && (
                            <div className="mt-3 space-y-1">
                                <p className="text-xs font-medium text-amber-700">
                                    Regressions
                                </p>
                                {analysis.regressions.map((item, i) => (
                                    <p
                                        key={i}
                                        className="text-sm leading-relaxed text-muted-foreground"
                                    >
                                        <span className="text-amber-600">
                                            -
                                        </span>{" "}
                                        {item}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {analysis.notes?.trim() && (
                    <p className="px-1 text-xs italic leading-relaxed text-muted-foreground">
                        {analysis.notes}
                    </p>
                )}
            </div>
        );
    }

    // ── Coaching section (Coaching tab) ──────────────────────────────
    if (section === "coaching") {
        const dimensions: Array<{
            key: string;
            title: string;
            dim: DimensionalAnalysis;
        }> = [
            {
                key: "structureAndFlow",
                title: "Structure & Flow",
                dim: analysis.structureAndFlow,
            },
            {
                key: "clarityAndConciseness",
                title: "Clarity & Conciseness",
                dim: analysis.clarityAndConciseness,
            },
            {
                key: "relevanceAndFocus",
                title: "Relevance & Focus",
                dim: analysis.relevanceAndFocus,
            },
            {
                key: "engagement",
                title: "Engagement",
                dim: analysis.engagement,
            },
            {
                key: "professionalism",
                title: "Professionalism",
                dim: analysis.professionalism,
            },
            {
                key: "voiceToneExpression",
                title: "Voice, Tone & Expression",
                dim: analysis.voiceToneExpression,
            },
        ];

        const hasAnyContent =
            topFixes.length > 0 ||
            moreMoments.length > 0 ||
            dimensions.some(
                (d) =>
                    d.dim.assessment.trim() || d.dim.findings.length > 0,
            );

        if (!hasAnyContent) {
            return (
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm font-medium">Coaching</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        No coaching findings for this conversation.
                    </p>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {topFixes.length > 0 ? (
                    <TopFixesCard
                        moments={topFixes}
                        onSeek={onSeekToSecond}
                    />
                ) : null}

                {moreMoments.length > 0 ? (
                    <MomentsList
                        moments={moreMoments}
                        onSeek={onSeekToSecond}
                    />
                ) : null}

                <BigPicturePanel
                    dimensions={dimensions}
                    renderChat={renderChat}
                />

                {renderChat("coaching", "Coaching", coachingToText(analysis))}
            </div>
        );
    }

    // ── Rewrites section (Improved Versions tab) ─────────────────────
    if (section === "rewrites") {
        return (
            <RewritesSection
                analysis={analysis}
                transcript={transcript}
                onSeekToSecond={onSeekToSecond}
                renderChat={renderChat}
            />
        );
    }

    return null;
}
