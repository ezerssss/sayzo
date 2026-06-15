"use client";

import { ChevronDown, Pencil, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { Kicker } from "@/components/coaching/briefing";
import { TranscriptCorrectionEditor } from "@/components/conversations/transcript-correction-editor";
import { TurnRewriteCard } from "@/components/conversations/turn-rewrite-card";
import { InlineMarkdown } from "@/components/session/inline-markdown";
import {
    applyCorrectionsToText,
    groupCorrectionsByIdx,
    isLockedFillerToken,
    segmentLineWithCorrections,
    tokenizeLine,
} from "@/lib/captures/corrections";
import { cn } from "@/lib/utils";
import type {
    CaptureTranscriptLine,
    TeachableMoment,
    TranscriptCorrection,
    TurnRewrite,
} from "@/schemas";
import { MAX_CORRECTIONS_PER_CAPTURE } from "@/schemas";

type Props = {
    transcript: CaptureTranscriptLine[];
    teachableMoments?: TeachableMoment[];
    turnRewrites?: TurnRewrite[];
    onSeekToSecond?: (seconds: number) => void;
    /** Enables the "fix a misheard word" affordance when provided. */
    captureId?: string;
    /** Mishearing fixes — rendered as an overlay; raw text stays the anchor. */
    corrections?: TranscriptCorrection[];
};

/** Raw segment text where each word is clickable to start a fix. */
function ClickableWords({
    segmentText,
    segmentStart,
    onWordClick,
}: {
    segmentText: string;
    segmentStart: number;
    onWordClick: (charStart: number) => void;
}) {
    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    for (const tok of tokenizeLine(segmentText)) {
        if (tok.start > cursor) {
            nodes.push(segmentText.slice(cursor, tok.start));
        }
        if (isLockedFillerToken(tok.text)) {
            nodes.push(tok.text);
        } else {
            nodes.push(
                <button
                    key={tok.start}
                    type="button"
                    onClick={() => onWordClick(segmentStart + tok.start)}
                    title="Click to fix what Sayzo heard"
                    // Hovering anywhere on the line faintly underlines every
                    // fixable word (the discover moment); hovering the word
                    // itself upgrades to the sky treatment.
                    className="cursor-pointer rounded-sm decoration-dotted underline-offset-2 group-hover/line:underline group-hover/line:decoration-foreground/25 hover:bg-sky-500/10 hover:underline hover:decoration-sky-500/70"
                >
                    {tok.text}
                </button>,
            );
        }
        cursor = tok.end;
    }
    if (cursor < segmentText.length) {
        nodes.push(segmentText.slice(cursor));
    }
    return <>{nodes}</>;
}

/**
 * Line text with corrected spans marked (dotted underline + tooltip). When
 * `onWordClick` is set, individual words are clickable to start a fix —
 * already-corrected spans and locked fillers are not.
 */
function CorrectedLineText({
    text,
    corrections,
    dimmed,
    onWordClick,
}: {
    text: string;
    corrections: TranscriptCorrection[];
    dimmed: boolean;
    onWordClick?: (charStart: number) => void;
}) {
    const segments = segmentLineWithCorrections(text, corrections);
    return (
        <p
            className={cn(
                "mt-1 text-sm leading-relaxed break-words",
                dimmed && "text-muted-foreground/70 italic",
            )}
        >
            {segments.map((s, i) =>
                s.kind === "corrected" ? (
                    <span
                        key={i}
                        className="underline decoration-dotted decoration-sky-500/60 underline-offset-2"
                        title={`Corrected by you — Sayzo originally heard "${s.original}"`}
                    >
                        {s.text}
                    </span>
                ) : onWordClick ? (
                    <ClickableWords
                        key={i}
                        segmentText={s.text}
                        segmentStart={s.start}
                        onWordClick={onWordClick}
                    />
                ) : (
                    <span key={i}>{s.text}</span>
                ),
            )}
        </p>
    );
}

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

function speakerLabel(speaker: string): string {
    if (speaker === "user") return "You";
    if (speaker === "other_unmic") return "Other (off-mic)";
    const match = /^other_(\d+)$/.exec(speaker);
    if (match) return `Other ${match[1]}`;
    return speaker;
}

const TRANSCRIPT_VIEWS = [
    { key: "all", label: "All", title: "Every line" },
    {
        key: "coaching",
        label: "Coaching",
        title: "Only turns with a coaching moment or an improvement",
    },
    {
        key: "read",
        label: "Read",
        title: "Just the conversation, no coaching markers",
    },
] as const;

type TranscriptViewMode = (typeof TRANSCRIPT_VIEWS)[number]["key"];

export function TranscriptView(props: Readonly<Props>) {
    const {
        transcript,
        teachableMoments = [],
        turnRewrites = [],
        onSeekToSecond,
        captureId,
        corrections = [],
    } = props;

    const correctionsByIdx = useMemo(
        () => groupCorrectionsByIdx(corrections),
        [corrections],
    );
    const [editing, setEditing] = useState<{
        lineIdx: number;
        clickedStart: number;
    } | null>(null);
    const correctionsEnabled =
        Boolean(captureId) && corrections.length < MAX_CORRECTIONS_PER_CAPTURE;

    const teachableByIdx = useMemo(() => {
        const map = new Map<number, TeachableMoment[]>();
        for (const m of teachableMoments) {
            const arr = map.get(m.transcriptIdx) ?? [];
            arr.push(m);
            map.set(m.transcriptIdx, arr);
        }
        return map;
    }, [teachableMoments]);

    const rewriteByIdx = useMemo(() => {
        const map = new Map<number, TurnRewrite>();
        for (const r of turnRewrites) {
            map.set(r.transcriptIdx, r);
        }
        return map;
    }, [turnRewrites]);

    const [view, setView] = useState<TranscriptViewMode>("all");
    // A turn is "coachable" if it has a coaching moment or an actionable
    // improvement (not a keep/non-English verdict) — the Coaching view filter.
    const coachableCount = useMemo(
        () =>
            transcript.reduce((n, _line, idx) => {
                const m = teachableByIdx.get(idx);
                const r = rewriteByIdx.get(idx);
                const coachable =
                    (m && m.length > 0) ||
                    (r && r.verdict !== "keep" && r.verdict !== "non_english");
                return coachable ? n + 1 : n;
            }, 0),
        [transcript, teachableByIdx, rewriteByIdx],
    );

    const seekToTurn = (transcriptIdx: number) => {
        const line = transcript[transcriptIdx];
        if (line && onSeekToSecond) onSeekToSecond(line.start);
    };

    const [expandedRewrites, setExpandedRewrites] = useState<Set<number>>(
        new Set(),
    );
    const [expandedMoments, setExpandedMoments] = useState<Set<number>>(
        new Set(),
    );

    const toggleRewrite = (idx: number) => {
        setExpandedRewrites((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const toggleMoment = (idx: number) => {
        setExpandedMoments((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    if (transcript.length === 0) {
        return (
            <p className="text-sm text-muted-foreground italic">
                No transcript available.
            </p>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div
                    data-tour="transcript-views"
                    className="inline-flex rounded-lg border border-border/60 bg-background p-0.5 text-xs"
                >
                    {TRANSCRIPT_VIEWS.map((v) => (
                        <button
                            key={v.key}
                            type="button"
                            onClick={() => setView(v.key)}
                            title={v.title}
                            className={cn(
                                "inline-flex items-center rounded-md px-3 py-1.5 font-medium transition-colors",
                                view === v.key
                                    ? "bg-sky-600 text-white"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {v.label}
                            {v.key === "coaching" && coachableCount > 0 ? (
                                <span
                                    className={cn(
                                        "ml-1.5 rounded-full px-1.5 text-[10px] font-semibold",
                                        view === "coaching"
                                            ? "bg-white/20 text-white"
                                            : "bg-muted text-muted-foreground",
                                    )}
                                >
                                    {coachableCount}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
                {correctionsEnabled && (
                    <p
                        data-tour="transcript-fix"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
                    >
                        <Pencil className="size-3 shrink-0 text-sky-500" />
                        Misheard a name or word? Click it in the transcript to
                        fix it.
                    </p>
                )}
            </div>
            {view === "coaching" && coachableCount === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                    No coaching moments here — every turn landed well.
                </p>
            ) : null}
            {transcript.map((line, idx) => {
                const isUser = line.speaker === "user";
                const moments = teachableByIdx.get(idx);
                const rewrite = rewriteByIdx.get(idx);
                const hasMoments = moments && moments.length > 0;
                // Non-English turns show a static label instead of the
                // rewrite expander — there is no coaching behind it.
                const isNonEnglish = rewrite?.verdict === "non_english";
                const hasRewrite = Boolean(rewrite) && !isNonEnglish;
                const isMomentExpanded = expandedMoments.has(idx);
                const isRewriteExpanded = expandedRewrites.has(idx);
                const coachable =
                    Boolean(hasMoments) ||
                    (hasRewrite && rewrite!.verdict !== "keep");
                // Coaching view shows only actionable turns; Read view hides
                // the coaching markers for a clean conversation read.
                if (view === "coaching" && !coachable) return null;
                const showCoaching = view !== "read";

                return (
                    <div
                        key={idx}
                        className={cn(
                            // Quiet left-accent on your turns (no fill/box); the
                            // transparent border keeps every line's text aligned.
                            "group/line border-l-2 border-transparent px-3",
                            isUser && "border-sky-300",
                        )}
                    >
                        {/* Speaker · time — one quiet header line. */}
                        <div className="flex items-baseline gap-2">
                            <span
                                className={cn(
                                    "text-xs font-semibold",
                                    isUser
                                        ? "text-sky-700"
                                        : "text-foreground/60",
                                )}
                            >
                                {speakerLabel(line.speaker)}
                            </span>
                            <span
                                aria-hidden
                                className="text-muted-foreground/40"
                            >
                                &middot;
                            </span>
                            {onSeekToSecond ? (
                                <button
                                    type="button"
                                    onClick={() => onSeekToSecond(line.start)}
                                    className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                                    title={`Seek to ${formatTimestamp(line.start)}`}
                                >
                                    <Play className="size-2.5" />
                                    {formatTimestamp(line.start)}
                                </button>
                            ) : (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                    {formatTimestamp(line.start)}
                                </span>
                            )}
                        </div>
                        <CorrectedLineText
                            text={line.text}
                            corrections={correctionsByIdx.get(idx) ?? []}
                            dimmed={isNonEnglish}
                            onWordClick={
                                correctionsEnabled
                                    ? (charStart) =>
                                          setEditing({
                                              lineIdx: idx,
                                              clickedStart: charStart,
                                          })
                                    : undefined
                            }
                        />
                        {captureId !== undefined &&
                            editing?.lineIdx === idx && (
                                <TranscriptCorrectionEditor
                                    key={`${editing.lineIdx}-${editing.clickedStart}`}
                                    captureId={captureId}
                                    transcript={transcript}
                                    transcriptIdx={idx}
                                    corrections={corrections}
                                    clickedStart={editing.clickedStart}
                                    onClose={() => setEditing(null)}
                                />
                            )}

                        {/* Inline affordances as quiet tinted pills — visible
                            enough not to be missed, tone-coded (amber coaching,
                            sky improvement, emerald already-strong), but no
                            border/icon so they don't shout. Hidden in Read view. */}
                        {showCoaching &&
                            (hasMoments || hasRewrite || isNonEnglish) && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    {isNonEnglish && (
                                        <span className="italic text-muted-foreground">
                                            Couldn&apos;t make this out clearly
                                        </span>
                                    )}
                                    {hasMoments && (
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 font-medium text-amber-700 transition-colors hover:bg-amber-200/70"
                                            onClick={() => toggleMoment(idx)}
                                        >
                                            {moments.length} coaching{" "}
                                            {moments.length === 1
                                                ? "moment"
                                                : "moments"}
                                            <ChevronDown
                                                className={cn(
                                                    "size-3 transition-transform",
                                                    isMomentExpanded &&
                                                        "rotate-180",
                                                )}
                                            />
                                        </button>
                                    )}
                                    {hasRewrite &&
                                        (rewrite!.verdict === "keep" ? (
                                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-700">
                                                Already strong
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 font-medium text-sky-700 transition-colors hover:bg-sky-200/70"
                                                onClick={() =>
                                                    toggleRewrite(idx)
                                                }
                                            >
                                                See improvement
                                                <ChevronDown
                                                    className={cn(
                                                        "size-3 transition-transform",
                                                        isRewriteExpanded &&
                                                            "rotate-180",
                                                    )}
                                                />
                                            </button>
                                        ))}
                                </div>
                            )}

                        {/* Expanded teachable moments */}
                        {showCoaching && isMomentExpanded && moments && (
                            <div className="mt-3 divide-y divide-border/50">
                                {moments.map((m, mIdx) => {
                                    const severityClass =
                                        m.severity === "major"
                                            ? "bg-red-100 text-red-700"
                                            : m.severity === "moderate"
                                              ? "bg-amber-100 text-amber-700"
                                              : "bg-muted text-muted-foreground";
                                    return (
                                        <div
                                            key={mIdx}
                                            className="space-y-3 py-4 first:pt-0"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                                    {m.type}
                                                </span>
                                                <span
                                                    className={cn(
                                                        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                                                        severityClass,
                                                    )}
                                                >
                                                    {m.severity}
                                                </span>
                                            </div>
                                            <blockquote className="border-l-2 border-border/70 pl-3 text-sm leading-relaxed text-foreground/90">
                                                {applyCorrectionsToText(
                                                    m.anchor,
                                                    correctionsByIdx.get(
                                                        m.transcriptIdx,
                                                    ) ?? [],
                                                )}
                                            </blockquote>
                                            {m.betterOption && (
                                                <div className="border-l-2 border-sky-300 pl-3">
                                                    <Kicker tone="sky">
                                                        Try instead
                                                    </Kicker>
                                                    <div className="mt-1">
                                                        <InlineMarkdown
                                                            text={
                                                                m.betterOption
                                                            }
                                                            tone="body"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                            {(() => {
                                                const why =
                                                    m.whyThisMatters?.trim() ||
                                                    "";
                                                return why ? (
                                                    <div>
                                                        <Kicker tone="muted">
                                                            Why this matters
                                                        </Kicker>
                                                        <div className="mt-1">
                                                            <InlineMarkdown
                                                                text={why}
                                                                tone="small-muted"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : null;
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Expanded turn rewrite */}
                        {showCoaching && isRewriteExpanded && rewrite && (
                            <div className="mt-2">
                                <TurnRewriteCard
                                    rewrite={rewrite}
                                    variant="embedded"
                                    onSuggestedIdxClick={seekToTurn}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
