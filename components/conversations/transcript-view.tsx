"use client";

import { ChevronDown, Flag, Play, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type {
    CaptureTranscriptLine,
    NativeSpeakerRewrite,
    TeachableMoment,
} from "@/types/captures";

type Props = {
    transcript: CaptureTranscriptLine[];
    teachableMoments?: TeachableMoment[];
    nativeSpeakerRewrites?: NativeSpeakerRewrite[];
    onSeekToSecond?: (seconds: number) => void;
};

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

export function TranscriptView(props: Readonly<Props>) {
    const { transcript, teachableMoments = [], nativeSpeakerRewrites = [], onSeekToSecond } = props;

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
        const map = new Map<number, NativeSpeakerRewrite>();
        for (const r of nativeSpeakerRewrites) {
            map.set(r.transcriptIdx, r);
        }
        return map;
    }, [nativeSpeakerRewrites]);

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
        <div className="space-y-1">
            {transcript.map((line, idx) => {
                const isUser = line.speaker === "user";
                const moments = teachableByIdx.get(idx);
                const rewrite = rewriteByIdx.get(idx);
                const hasMoments = moments && moments.length > 0;
                const hasRewrite = Boolean(rewrite);
                const isMomentExpanded = expandedMoments.has(idx);
                const isRewriteExpanded = expandedRewrites.has(idx);

                return (
                    <div
                        key={idx}
                        className={cn(
                            "rounded-lg px-3 py-2",
                            isUser &&
                                "border-l-2 border-primary/30 bg-primary/5",
                        )}
                    >
                        <div className="flex items-start gap-2">
                            {onSeekToSecond ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onSeekToSecond(line.start)
                                    }
                                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted/80"
                                    title={`Seek to ${formatTimestamp(line.start)}`}
                                >
                                    <Play className="size-3" />
                                    {formatTimestamp(line.start)}
                                </button>
                            ) : (
                                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                                    {formatTimestamp(line.start)}
                                </span>
                            )}
                            <div className="min-w-0 flex-1">
                                <span
                                    className={cn(
                                        "text-[11px] font-semibold uppercase tracking-wider",
                                        isUser
                                            ? "text-primary"
                                            : "text-muted-foreground",
                                    )}
                                >
                                    {speakerLabel(line.speaker)}
                                </span>
                                <p className="mt-1 text-sm leading-relaxed">
                                    {line.text}
                                </p>

                                {/* Inline badges for teachable moments and rewrites */}
                                {(hasMoments || hasRewrite) && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {hasMoments && (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                                                onClick={() =>
                                                    toggleMoment(idx)
                                                }
                                            >
                                                <Flag className="size-3" />
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
                                        {hasRewrite && (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground/80 hover:bg-muted/80"
                                                onClick={() =>
                                                    toggleRewrite(idx)
                                                }
                                            >
                                                <Sparkles className="size-3" />
                                                Rewrite available
                                                <ChevronDown
                                                    className={cn(
                                                        "size-3 transition-transform",
                                                        isRewriteExpanded &&
                                                            "rotate-180",
                                                    )}
                                                />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Expanded teachable moments */}
                                {isMomentExpanded && moments && (
                                    <div className="mt-2 space-y-2">
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
                                                    className="rounded-xl border border-border/60 bg-background p-4"
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
                                                    <div className="mt-3">
                                                        <blockquote className="border-l-2 border-border/70 pl-3 text-sm leading-relaxed text-foreground/90">
                                                            {m.anchor}
                                                        </blockquote>
                                                    </div>
                                                    {m.betterOption && (
                                                        <div className="mt-3 rounded-lg bg-muted/50 p-3">
                                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                                Try instead
                                                            </p>
                                                            <p className="mt-1 text-sm text-foreground">
                                                                {m.betterOption}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {(m.whyIssue ||
                                                        m.keyTakeaway) && (
                                                        <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                                                            {m.whyIssue && (
                                                                <p>
                                                                    <span className="font-semibold text-foreground/80">
                                                                        Why:
                                                                    </span>{" "}
                                                                    {m.whyIssue}
                                                                </p>
                                                            )}
                                                            {m.keyTakeaway && (
                                                                <p>
                                                                    <span className="font-semibold text-foreground/80">
                                                                        Takeaway:
                                                                    </span>{" "}
                                                                    {
                                                                        m.keyTakeaway
                                                                    }
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Expanded native speaker rewrite */}
                                {isRewriteExpanded && rewrite && (
                                    <div className="mt-2 rounded-xl border border-border/60 bg-background p-4">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="size-3.5 text-foreground" />
                                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                How a fluent speaker would say
                                                it
                                            </p>
                                        </div>
                                        <p className="mt-2 text-sm leading-relaxed text-foreground">
                                            {rewrite.rewrite}
                                        </p>
                                        {rewrite.note && (
                                            <div className="mt-3 rounded-lg bg-muted/40 p-3">
                                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    What changed
                                                </p>
                                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                    {rewrite.note}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
