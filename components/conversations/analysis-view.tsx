"use client";

import { ChevronDown, Play, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import { FeedbackChat } from "@/components/session/feedback-chat";
import type {
    CaptureAnalysis,
    CoachingMoment,
    DimensionalAnalysis,
    TeachableMoment,
} from "@/types/captures";

type Props = {
    analysis: CaptureAnalysis;
    onSeekToSecond?: (seconds: number) => void;
    /** When set, only render the specified section. When absent, render all. */
    section?: "overview" | "coaching" | "rewrites";
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
    subtitle,
    defaultOpen = false,
    emphasized = false,
    children,
}: {
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    emphasized?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div
            className={`rounded-2xl border ${
                emphasized
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/70 bg-background"
            }`}
        >
            <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-5 text-left"
                onClick={() => setOpen((v) => !v)}
            >
                <span
                    className={`text-sm font-semibold tracking-tight ${
                        emphasized ? "text-primary" : ""
                    }`}
                >
                    {title}
                </span>
                <span className="flex items-center gap-2">
                    {subtitle ? (
                        <span className="text-xs text-muted-foreground">
                            {subtitle}
                        </span>
                    ) : null}
                    <ChevronDown
                        className={`size-4 text-muted-foreground transition-transform ${
                            open ? "rotate-180" : ""
                        }`}
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

function CoachingMomentCard({ moment }: { moment: CoachingMoment }) {
    return (
        <div className="rounded-lg border border-border/50 bg-background/50 p-3 space-y-3">
            <blockquote className="border-l-2 border-border/70 pl-3 text-sm leading-relaxed text-foreground/90">
                {moment.anchor}
            </blockquote>
            {moment.betterOption && (
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Try instead
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                        {moment.betterOption}
                    </p>
                </div>
            )}
            <div className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {moment.whyIssue && (
                    <p>
                        <span className="font-semibold text-foreground/80">
                            Why:
                        </span>{" "}
                        {moment.whyIssue}
                    </p>
                )}
                {moment.keyTakeaway && (
                    <p>
                        <span className="font-semibold text-foreground/80">
                            Takeaway:
                        </span>{" "}
                        {moment.keyTakeaway}
                    </p>
                )}
            </div>
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
        <CollapsibleCard
            title={title}
            subtitle={
                dimension.findings.length > 0
                    ? dimension.findings.length === 1
                        ? "1 finding"
                        : `${dimension.findings.length} findings`
                    : undefined
            }
            defaultOpen={emphasized}
            emphasized={emphasized}
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

function TeachableMomentRow({
    moment,
    onSeek,
}: {
    moment: TeachableMoment;
    onSeek?: (seconds: number) => void;
}) {
    const [expanded, setExpanded] = useState(false);

    const severityClass =
        moment.severity === "major"
            ? "bg-red-100 text-red-700"
            : moment.severity === "moderate"
              ? "bg-amber-100 text-amber-700"
              : "bg-muted text-muted-foreground";

    return (
        <div className="rounded-xl border border-border/60 bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
                {onSeek ? (
                    <button
                        type="button"
                        onClick={() => onSeek(moment.timestamp)}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted/80"
                        title={`Seek to ${formatTimestamp(moment.timestamp)}`}
                    >
                        <Play className="size-3" />
                        {formatTimestamp(moment.timestamp)}
                    </button>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                        {formatTimestamp(moment.timestamp)}
                    </span>
                )}
                <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {moment.type}
                </span>
                <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${severityClass}`}
                >
                    {moment.severity}
                </span>
            </div>

            <div className="mt-3">
                <blockquote className="border-l-2 border-border/70 pl-3 text-sm leading-relaxed text-foreground/90">
                    {moment.anchor}
                </blockquote>
            </div>

            {moment.betterOption && (
                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Try instead
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                        {moment.betterOption}
                    </p>
                </div>
            )}

            {(moment.whyIssue || moment.keyTakeaway) && (
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown
                            className={`size-3 transition-transform ${
                                expanded ? "rotate-180" : ""
                            }`}
                        />
                        {expanded ? "Hide why" : "Why this matters"}
                    </button>
                    {expanded && (
                        <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                            {moment.whyIssue && <p>{moment.whyIssue}</p>}
                            {moment.keyTakeaway && (
                                <p>
                                    <span className="font-semibold text-foreground/80">
                                        Takeaway:
                                    </span>{" "}
                                    {moment.keyTakeaway}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
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
        <div className="rounded-lg border border-border/50 bg-background/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight">
                {value}
            </p>
            {detail && (
                <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
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
    const { analysis, onSeekToSecond, section, captureId, uid } = props;
    const chatEnabled = Boolean(captureId && uid);

    const renderChat = (sectionKey: string, sectionTitle: string, content: string) => {
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

                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        At a glance
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Communication style
                        </p>
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
                </div>

                {/* Progress */}
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
                        title="Teachable moments"
                        subtitle={
                            analysis.teachableMoments.length === 1
                                ? "1 moment"
                                : `${analysis.teachableMoments.length} moments`
                        }
                        defaultOpen
                    >
                        <ul className="space-y-3">
                            {analysis.teachableMoments.map((m, i) => (
                                <li key={i}>
                                    <TeachableMomentRow
                                        moment={m}
                                        onSeek={onSeekToSecond}
                                    />
                                </li>
                            ))}
                        </ul>
                        {renderChat(
                            "teachableMoments",
                            "Teachable moments",
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

        const rewriteContent = rewritesToText(analysis);

        return (
            <div className="space-y-4">
                {/* Header card — matches ImprovedVersionView */}
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5">
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-foreground" />
                        <h3 className="text-sm font-semibold tracking-tight">
                            How it could sound
                        </h3>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Your conversation, rewritten the way a confident
                        speaker would deliver it.
                    </p>
                </div>

                {/* Full cohesive rewrite */}
                {hasFullRewrite && (
                    <div className="rounded-xl border border-border/70 bg-background p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Full rewrite
                        </p>
                        <div className="prose prose-sm mt-3 max-w-none text-sm leading-relaxed [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border/70 [&_blockquote]:pl-3 [&_blockquote]:text-xs [&_blockquote]:text-muted-foreground">
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
                        title="Per-turn rewrites"
                        subtitle={
                            analysis.nativeSpeakerRewrites.length === 1
                                ? "1 rewrite"
                                : `${analysis.nativeSpeakerRewrites.length} rewrites`
                        }
                    >
                        <ol className="space-y-3">
                            {analysis.nativeSpeakerRewrites.map((r, i) => (
                                <li
                                    key={i}
                                    className="rounded-xl border border-border/70 bg-background p-4"
                                >
                                    <div className="flex gap-3">
                                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                                            {i + 1}
                                        </span>
                                        <div className="flex-1 space-y-3">
                                            <p className="text-xs leading-relaxed text-muted-foreground line-through">
                                                {r.original}
                                            </p>
                                            <p className="text-[15px] leading-relaxed text-foreground">
                                                {r.rewrite}
                                            </p>
                                            {r.note && (
                                                <div className="rounded-lg bg-muted/40 p-3">
                                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                        What changed
                                                    </p>
                                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                        {r.note}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </CollapsibleCard>
                )}

                {renderChat(
                    "nativeSpeakerVersion",
                    "Improved version",
                    rewriteContent,
                )}
            </div>
        );
    }

    // ── No section specified: shouldn't happen with tabs, but safe fallback ──
    return null;
}
