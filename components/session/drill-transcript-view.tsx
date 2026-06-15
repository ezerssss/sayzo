"use client";

import { ChevronDown, Flag, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { Eyebrow } from "@/components/app/eyebrow";
import { Kicker } from "@/components/coaching/briefing";
import { InlineMarkdown } from "@/components/session/inline-markdown";
import { cn } from "@/lib/utils";
import type { CaptureTranscriptLine, TeachableMoment } from "@/schemas";

type Props = {
    serverTranscript?: CaptureTranscriptLine[] | null;
    transcript?: string | null;
    /** Top fix-these-first moments from the analysis, used to annotate
     *  matching transcript lines with a flag chip. Pass `null` when there's
     *  no analysis yet (e.g. processing). */
    fixTheseFirst?: TeachableMoment[] | null;
    onSeekToSecond?: (seconds: number) => void;
    heading?: string;
    defaultCollapsed?: boolean;
};

type LegacyLine = {
    timestampLabel: string | null;
    timestampSeconds: number | null;
    text: string;
};

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

function parseStampToSeconds(stamp: string): number | null {
    const parts = stamp.split(":").map((n) => Number(n));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 3) {
        return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
    }
    if (parts.length === 2) {
        return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
    }
    return null;
}

function parseLegacyLines(transcript: string): LegacyLine[] {
    const lines = transcript
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    return lines.map((line) => {
        const m = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/.exec(line);
        if (!m) {
            return { timestampLabel: null, timestampSeconds: null, text: line };
        }
        const stamp = m[1] ?? "";
        const body = (m[2] ?? "").trim();
        return {
            timestampLabel: stamp,
            timestampSeconds: parseStampToSeconds(stamp),
            text: body,
        };
    });
}

function buildMomentsByLine(
    moments: TeachableMoment[],
    lines: Pick<CaptureTranscriptLine, "start" | "end">[],
): Map<number, TeachableMoment[]> {
    const map = new Map<number, TeachableMoment[]>();
    if (lines.length === 0) return map;
    for (const moment of moments) {
        const idx = moment.transcriptIdx;
        if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) continue;
        const arr = map.get(idx) ?? [];
        arr.push(moment);
        map.set(idx, arr);
    }
    return map;
}

export function DrillTranscriptView(props: Readonly<Props>) {
    const {
        serverTranscript,
        transcript,
        fixTheseFirst,
        onSeekToSecond,
        heading = "Transcript",
        defaultCollapsed = true,
    } = props;

    const [isOpen, setIsOpen] = useState(!defaultCollapsed);
    const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

    const structuredLines = useMemo<CaptureTranscriptLine[] | null>(() => {
        if (serverTranscript && serverTranscript.length > 0) {
            return serverTranscript;
        }
        return null;
    }, [serverTranscript]);

    const legacyLines = useMemo<LegacyLine[] | null>(() => {
        if (structuredLines) return null;
        if (!transcript?.trim()) return null;
        return parseLegacyLines(transcript);
    }, [structuredLines, transcript]);

    const momentsByLineIdx = useMemo(() => {
        if (!structuredLines || !fixTheseFirst || fixTheseFirst.length === 0) {
            return new Map<number, TeachableMoment[]>();
        }
        return buildMomentsByLine(
            fixTheseFirst,
            structuredLines.map((l) => ({ start: l.start, end: l.end })),
        );
    }, [structuredLines, fixTheseFirst]);

    const toggleLine = (idx: number) => {
        setExpandedLines((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const hasContent = Boolean(
        (structuredLines && structuredLines.length > 0) ||
        (legacyLines && legacyLines.length > 0),
    );

    if (!hasContent) {
        return (
            <div>
                <Eyebrow tone="muted">{heading}</Eyebrow>
                <p className="mt-2 text-sm text-muted-foreground">
                    No transcript available.
                </p>
            </div>
        );
    }

    return (
        <div>
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between"
            >
                <span className="text-sm font-medium">{heading}</span>
                <ChevronDown
                    className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
            {isOpen ? (
                <div className="mt-3 divide-y divide-border/50 border-t border-border/50 pt-3">
                    {structuredLines
                        ? structuredLines.map((line, idx) => {
                              const moments = momentsByLineIdx.get(idx) ?? [];
                              const isExpanded = expandedLines.has(idx);
                              return (
                                  <StructuredLineRow
                                      key={idx}
                                      line={line}
                                      moments={moments}
                                      isExpanded={isExpanded}
                                      onToggleExpand={() => toggleLine(idx)}
                                      onSeekToSecond={onSeekToSecond}
                                  />
                              );
                          })
                        : legacyLines?.map((line, idx) => (
                              <LegacyLineRow
                                  key={idx}
                                  line={line}
                                  onSeekToSecond={onSeekToSecond}
                              />
                          ))}
                </div>
            ) : null}
        </div>
    );
}

function StructuredLineRow({
    line,
    moments,
    isExpanded,
    onToggleExpand,
    onSeekToSecond,
}: {
    line: CaptureTranscriptLine;
    moments: TeachableMoment[];
    isExpanded: boolean;
    onToggleExpand: () => void;
    onSeekToSecond?: (seconds: number) => void;
}) {
    return (
        <div className="py-3 first:pt-0">
            <div className="flex items-start gap-2">
                {onSeekToSecond ? (
                    <button
                        type="button"
                        onClick={() => onSeekToSecond(line.start)}
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
                    <p className="text-sm leading-relaxed">{line.text}</p>
                    {moments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                                onClick={onToggleExpand}
                            >
                                <Flag className="size-3" />
                                {moments.length} coaching{" "}
                                {moments.length === 1 ? "moment" : "moments"}
                                <ChevronDown
                                    className={cn(
                                        "size-3 transition-transform",
                                        isExpanded && "rotate-180",
                                    )}
                                />
                            </button>
                        </div>
                    )}
                    {isExpanded && moments.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {moments.map((m, i) => (
                                <MomentDetailCard
                                    key={`${m.timestamp}-${i}`}
                                    moment={m}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MomentDetailCard({ moment }: { moment: TeachableMoment }) {
    return (
        <div className="space-y-3">
            <blockquote className="border-l-2 border-border/70 pl-3 text-sm leading-relaxed text-foreground/90">
                {moment.anchor}
            </blockquote>
            {moment.betterOption && (
                <div className="border-l-2 border-sky-300 pl-3">
                    <Kicker>Try instead</Kicker>
                    <div className="mt-1">
                        <InlineMarkdown
                            text={moment.betterOption}
                            tone="body"
                        />
                    </div>
                </div>
            )}
            {moment.whyThisMatters && (
                <div>
                    <InlineMarkdown
                        text={moment.whyThisMatters}
                        tone="small-muted"
                    />
                </div>
            )}
        </div>
    );
}

function LegacyLineRow({
    line,
    onSeekToSecond,
}: {
    line: LegacyLine;
    onSeekToSecond?: (seconds: number) => void;
}) {
    const canSeek =
        line.timestampLabel != null &&
        line.timestampSeconds != null &&
        onSeekToSecond != null;
    return (
        <div className="py-3 first:pt-0">
            <div className="flex items-start gap-2">
                {canSeek ? (
                    <button
                        type="button"
                        onClick={() =>
                            onSeekToSecond!(line.timestampSeconds as number)
                        }
                        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted/80"
                    >
                        <Play className="size-3" />
                        {line.timestampLabel}
                    </button>
                ) : line.timestampLabel ? (
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                        {line.timestampLabel}
                    </span>
                ) : null}
                <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">{line.text}</p>
                </div>
            </div>
        </div>
    );
}
