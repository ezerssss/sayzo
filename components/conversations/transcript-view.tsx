"use client";

import { ChevronDown, ChevronRight, Flag, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

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
                        className={`rounded-lg px-3 py-2 ${
                            isUser
                                ? "bg-primary/5 border-l-2 border-primary/30"
                                : "bg-transparent"
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <button
                                type="button"
                                className="shrink-0 text-xs text-muted-foreground/70 font-mono hover:text-primary transition-colors mt-0.5"
                                onClick={() => onSeekToSecond?.(line.start)}
                                title={`Seek to ${formatTimestamp(line.start)}`}
                            >
                                {formatTimestamp(line.start)}
                            </button>
                            <div className="min-w-0 flex-1">
                                <span
                                    className={`text-xs font-medium ${
                                        isUser
                                            ? "text-primary"
                                            : "text-muted-foreground"
                                    }`}
                                >
                                    {speakerLabel(line.speaker)}
                                </span>
                                <p className="text-sm leading-relaxed mt-0.5">
                                    {line.text}
                                </p>

                                {/* Inline badges for teachable moments and rewrites */}
                                {(hasMoments || hasRewrite) && (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {hasMoments && (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                                                onClick={() =>
                                                    toggleMoment(idx)
                                                }
                                            >
                                                <Flag className="h-3 w-3" />
                                                {moments.length} coaching{" "}
                                                {moments.length === 1
                                                    ? "moment"
                                                    : "moments"}
                                                {isMomentExpanded ? (
                                                    <ChevronDown className="h-3 w-3" />
                                                ) : (
                                                    <ChevronRight className="h-3 w-3" />
                                                )}
                                            </button>
                                        )}
                                        {hasRewrite && (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                                                onClick={() =>
                                                    toggleRewrite(idx)
                                                }
                                            >
                                                <Sparkles className="h-3 w-3" />
                                                Rewrite available
                                                {isRewriteExpanded ? (
                                                    <ChevronDown className="h-3 w-3" />
                                                ) : (
                                                    <ChevronRight className="h-3 w-3" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Expanded teachable moments */}
                                {isMomentExpanded && moments && (
                                    <div className="mt-2 space-y-2">
                                        {moments.map((m, mIdx) => (
                                            <div
                                                key={mIdx}
                                                className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm"
                                            >
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="rounded bg-amber-200/60 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                                                        {m.type}
                                                    </span>
                                                    <span
                                                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                                            m.severity ===
                                                            "major"
                                                                ? "bg-red-100 text-red-700"
                                                                : m.severity ===
                                                                    "moderate"
                                                                  ? "bg-amber-100 text-amber-700"
                                                                  : "bg-gray-100 text-gray-600"
                                                        }`}
                                                    >
                                                        {m.severity}
                                                    </span>
                                                </div>
                                                <p className="text-muted-foreground">
                                                    <strong>What happened:</strong>{" "}
                                                    {m.anchor}
                                                </p>
                                                <p className="text-muted-foreground mt-1">
                                                    <strong>
                                                        Why this is an issue:
                                                    </strong>{" "}
                                                    {m.whyIssue}
                                                </p>
                                                <p className="text-muted-foreground mt-1">
                                                    <strong>Better:</strong>{" "}
                                                    {m.betterOption}
                                                </p>
                                                <p className="text-primary/80 mt-1 font-medium">
                                                    <strong>
                                                        Key takeaway:
                                                    </strong>{" "}
                                                    {m.keyTakeaway}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Expanded native speaker rewrite */}
                                {isRewriteExpanded && rewrite && (
                                    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-sm">
                                        <p className="text-xs font-medium text-violet-800 mb-1.5">
                                            How a fluent speaker would say it
                                        </p>
                                        <p className="text-sm leading-relaxed">
                                            {rewrite.rewrite}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-2 italic">
                                            {rewrite.note}
                                        </p>
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
