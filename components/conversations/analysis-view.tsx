"use client";

import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FeedbackChat } from "@/components/session/feedback-chat";
import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
    CoachingMoment,
    DimensionalAnalysis,
    TeachableMoment,
    NativeSpeakerRewrite,
} from "@/types/captures";

type Props = {
    analysis: CaptureAnalysis;
    onSeekToSecond?: (seconds: number) => void;
    /** When set, only render the specified section. When absent, render all. */
    section?: "overview" | "coaching" | "rewrites";
    /** Full transcript — needed for the "rewrites" section to show a flowing improved version. */
    transcript?: CaptureTranscriptLine[];
    /** When both provided, enables a per-section "Discuss this feedback" chat. */
    captureId?: string;
    uid?: string;
};

function formatCoachingMoment(moment: CoachingMoment): string {
    return `- **What happened:** ${moment.anchor}\n  - **Why this is an issue:** ${moment.whyIssue}\n  - **Better:** ${moment.betterOption}\n  - **Key takeaway:** ${moment.keyTakeaway}`;
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

function teachableMomentsToText(moments: TeachableMoment[]): string {
    if (!moments.length) return "";
    return moments
        .map((m) => {
            const mm = Math.floor(m.timestamp / 60);
            const ss = Math.floor(m.timestamp % 60)
                .toString()
                .padStart(2, "0");
            return `**[${mm}:${ss}] ${m.type} (${m.severity})**\n${formatCoachingMoment(m)}`;
        })
        .join("\n\n");
}

function rewritesToText(analysis: CaptureAnalysis): string {
    const parts: string[] = [];
    if (analysis.nativeSpeakerVersion?.trim()) {
        parts.push(
            `**Full native-speaker rewrite:**\n${analysis.nativeSpeakerVersion.trim()}`,
        );
    }
    if (analysis.nativeSpeakerRewrites.length > 0) {
        parts.push(
            `**Per-turn rewrites:**\n${analysis.nativeSpeakerRewrites
                .map(
                    (r) =>
                        `- Original: "${r.original}"\n  - Rewrite: "${r.rewrite}"\n  - Note: ${r.note}`,
                )
                .join("\n")}`,
        );
    }
    return parts.join("\n\n");
}

function formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

function CollapsibleCard({
    title,
    defaultOpen = false,
    emphasized = false,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    emphasized?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div
            className={`rounded-xl border ${
                emphasized
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/70 bg-card"
            }`}
        >
            <button
                type="button"
                className="flex w-full items-center gap-2 p-4 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                {open ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span
                    className={`text-sm font-semibold ${
                        emphasized ? "text-primary" : ""
                    }`}
                >
                    {title}
                </span>
            </button>
            {open && <div className="px-4 pb-4">{children}</div>}
        </div>
    );
}

function CoachingMomentCard({ moment }: { moment: CoachingMoment }) {
    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm space-y-1.5">
            <p>
                <span className="font-medium text-muted-foreground">
                    What happened:
                </span>{" "}
                {moment.anchor}
            </p>
            <p>
                <span className="font-medium text-muted-foreground">
                    Why this is an issue:
                </span>{" "}
                {moment.whyIssue}
            </p>
            <p>
                <span className="font-medium text-muted-foreground">
                    Better:
                </span>{" "}
                {moment.betterOption}
            </p>
            <p className="text-primary/80 font-medium">
                <span className="text-muted-foreground font-medium">
                    Key takeaway:
                </span>{" "}
                {moment.keyTakeaway}
            </p>
        </div>
    );
}

function DimensionalCard({
    title,
    dimension,
    emphasized = false,
    chat,
}: {
    title: string;
    dimension: DimensionalAnalysis;
    emphasized?: boolean;
    chat?: ReactNode;
}) {
    return (
        <CollapsibleCard title={title} defaultOpen={emphasized} emphasized={emphasized}>
            <p className="text-sm text-muted-foreground leading-relaxed">
                {dimension.assessment}
            </p>
            {dimension.findings.length > 0 && (
                <div className="mt-3 space-y-2">
                    {dimension.findings.map((finding, i) => (
                        <CoachingMomentCard key={i} moment={finding} />
                    ))}
                </div>
            )}
            {chat}
        </CollapsibleCard>
    );
}

function TeachableMomentRow({
    moment,
    onSeek,
}: {
    moment: TeachableMoment;
    onSeek?: (seconds: number) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground/70 font-mono hover:text-primary transition-colors mt-0.5"
                    onClick={() => onSeek?.(moment.timestamp)}
                    title={`Seek to ${formatTimestamp(moment.timestamp)}`}
                >
                    {formatTimestamp(moment.timestamp)}
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-amber-200/60 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            {moment.type}
                        </span>
                        <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                moment.severity === "major"
                                    ? "bg-red-100 text-red-700"
                                    : moment.severity === "moderate"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-gray-100 text-gray-600"
                            }`}
                        >
                            {moment.severity}
                        </span>
                        <button
                            type="button"
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setExpanded((v) => !v)}
                        >
                            {expanded ? "Collapse" : "Expand"}
                        </button>
                    </div>
                    <p className="text-sm mt-1">{moment.anchor}</p>
                    {expanded && (
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <p>
                                <strong>Why:</strong> {moment.whyIssue}
                            </p>
                            <p>
                                <strong>Better:</strong>{" "}
                                {moment.betterOption}
                            </p>
                            <p className="text-primary/80 font-medium">
                                <strong className="text-muted-foreground font-medium">
                                    Takeaway:
                                </strong>{" "}
                                {moment.keyTakeaway}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function RewriteRow({
    rewrite,
    onSeek,
}: {
    rewrite: NativeSpeakerRewrite;
    onSeek?: (seconds: number) => void;
}) {
    return (
        <button
            type="button"
            className="w-full rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-left hover:bg-violet-50 transition-colors"
            onClick={() => onSeek?.(0)}
        >
            <div className="text-sm space-y-1.5">
                <p className="text-muted-foreground line-through">
                    {rewrite.original}
                </p>
                <p className="text-sm">{rewrite.rewrite}</p>
                <p className="text-xs text-muted-foreground italic">
                    {rewrite.note}
                </p>
            </div>
        </button>
    );
}

function MetricCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail?: string;
}) {
    return (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold mt-0.5">{value}</p>
            {detail && (
                <p className="text-xs text-muted-foreground mt-0.5">
                    {detail}
                </p>
            )}
        </div>
    );
}

function GaugeBar({ label, value }: { label: string; value: number }) {
    const pct = Math.round(value * 100);
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-primary/60 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

export function AnalysisView(props: Readonly<Props>) {
    const {
        analysis,
        onSeekToSecond,
        section,
        transcript = [],
        captureId,
        uid,
    } = props;
    const chatEnabled = Boolean(captureId && uid);

    const renderChat = (sectionKey: string, sectionTitle: string, content: string) => {
        if (!chatEnabled || !content.trim()) return null;
        return (
            <FeedbackChat
                source="capture"
                sourceId={captureId!}
                uid={uid!}
                sectionKey={sectionKey}
                sectionTitle={sectionTitle}
                feedbackContent={content}
                onSeekToSecond={onSeekToSecond}
            />
        );
    };

    // ── Overview section (Main tab) ──────────────────────────────────
    if (section === "overview") {
        const overviewContent = overviewToText(analysis);
        return (
            <div className="space-y-3">
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm font-medium mb-2">Overview</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {analysis.overview}
                    </p>
                    {renderChat("overview", "Overview", overviewContent)}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <p className="text-xs font-medium text-amber-800 uppercase tracking-wide">
                        Main issue
                    </p>
                    <p className="text-sm mt-1 font-medium">
                        {analysis.mainIssue}
                    </p>
                    {analysis.secondaryIssues.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            {analysis.secondaryIssues.map((issue, i) => (
                                <li
                                    key={i}
                                    className="text-sm text-muted-foreground"
                                >
                                    &bull; {issue}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Compact metrics in overview */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MetricCard
                        label="Filler rate"
                        value={`${analysis.fillerWords.perMinute.toFixed(1)}/min`}
                        detail={`${analysis.fillerWords.totalCount} total`}
                    />
                    <MetricCard
                        label="Speaking pace"
                        value={`${analysis.fluency.wordsPerMinute} WPM`}
                    />
                    <MetricCard
                        label="Vocabulary"
                        value={String(analysis.vocabulary.uniqueWords)}
                        detail={`Sophistication: ${Math.round(analysis.vocabulary.sophisticationScore * 100)}%`}
                    />
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 p-4">
                    <GaugeBar
                        label="Directness"
                        value={analysis.communicationStyle.directness}
                    />
                    <GaugeBar
                        label="Formality"
                        value={analysis.communicationStyle.formality}
                    />
                    <GaugeBar
                        label="Confidence"
                        value={analysis.communicationStyle.confidence}
                    />
                </div>

                {/* Progress */}
                {(analysis.improvements.length > 0 ||
                    analysis.regressions.length > 0) && (
                    <div className="rounded-xl border border-border/70 p-4">
                        {analysis.improvements.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
                                    Improvements
                                </p>
                                {analysis.improvements.map((item, i) => (
                                    <p
                                        key={i}
                                        className="text-sm text-muted-foreground"
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
                                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">
                                    Regressions
                                </p>
                                {analysis.regressions.map((item, i) => (
                                    <p
                                        key={i}
                                        className="text-sm text-muted-foreground"
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
                    <p className="text-xs text-muted-foreground italic px-1">
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
            emphasized?: boolean;
        }> = [
            {
                key: "structureAndFlow",
                title: "Structure & Flow",
                dim: analysis.structureAndFlow,
                emphasized: true,
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

        return (
            <div className="space-y-3">
                {dimensions.map((d) => (
                    <DimensionalCard
                        key={d.key}
                        title={d.title}
                        dimension={d.dim}
                        emphasized={d.emphasized}
                        chat={renderChat(
                            d.key,
                            d.title,
                            dimensionalToText(d.dim),
                        )}
                    />
                ))}

                {analysis.teachableMoments.length > 0 && (
                    <CollapsibleCard
                        title={`Teachable Moments (${analysis.teachableMoments.length})`}
                    >
                        <div className="space-y-2">
                            {analysis.teachableMoments.map((m, i) => (
                                <TeachableMomentRow
                                    key={i}
                                    moment={m}
                                    onSeek={onSeekToSecond}
                                />
                            ))}
                        </div>
                        {renderChat(
                            "teachableMoments",
                            "Teachable Moments",
                            teachableMomentsToText(analysis.teachableMoments),
                        )}
                    </CollapsibleCard>
                )}
            </div>
        );
    }

    // ── Rewrites section (Improved Versions tab) ─────────────────────
    // Shows the full cohesive rewrite first (nativeSpeakerVersion), then
    // per-turn rewrites below as a secondary reference.
    if (section === "rewrites") {
        const hasFullRewrite = Boolean(analysis.nativeSpeakerVersion?.trim());
        const hasPerTurnRewrites = analysis.nativeSpeakerRewrites.length > 0;

        if (!hasFullRewrite && !hasPerTurnRewrites) {
            return (
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm font-medium">Improved Version</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        No improved version was generated for this conversation.
                        This usually means your delivery was already strong.
                    </p>
                </div>
            );
        }

        const rewriteContent = rewritesToText(analysis);

        return (
            <div className="space-y-4">
                {/* Full cohesive rewrite — the main content */}
                {hasFullRewrite && (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium mb-3">
                            How a fluent speaker would have said it
                        </p>
                        <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:border-violet-300 [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_blockquote]:not-italic [&_blockquote]:my-2">
                            {analysis.nativeSpeakerVersion!
                                .split("\n")
                                .map((line, i) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <br key={i} />;
                                    if (trimmed.startsWith("> ")) {
                                        return (
                                            <blockquote key={i}>
                                                {trimmed.slice(2)}
                                            </blockquote>
                                        );
                                    }
                                    return <p key={i}>{trimmed}</p>;
                                })}
                        </div>
                    </div>
                )}

                {/* Per-turn rewrites — secondary reference */}
                {hasPerTurnRewrites && (
                    <CollapsibleCard
                        title={`Per-turn Rewrites (${analysis.nativeSpeakerRewrites.length})`}
                    >
                        <div className="space-y-3">
                            {analysis.nativeSpeakerRewrites.map((r, i) => (
                                <div
                                    key={i}
                                    className="rounded-lg border border-violet-200 bg-violet-50/30 p-3"
                                >
                                    <p className="text-xs text-muted-foreground line-through">
                                        {r.original}
                                    </p>
                                    <p className="text-sm mt-1.5">
                                        {r.rewrite}
                                    </p>
                                    <p className="text-xs text-muted-foreground italic mt-1.5">
                                        {r.note}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </CollapsibleCard>
                )}

                {renderChat(
                    "nativeSpeakerVersion",
                    "Improved Version",
                    rewriteContent,
                )}
            </div>
        );
    }

    // ── No section specified: shouldn't happen with tabs, but safe fallback ──
    return null;
}
