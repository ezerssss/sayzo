"use client";

import { ChevronDown, MessageCircle, Play } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { FeedbackChat } from "@/components/session/feedback-chat";
import { cn } from "@/lib/utils";
import {
    COACHING_SECTION_LABELS,
    groupMomentsByTimestamp,
    parseAllCoachingSections,
    pickTopFixes,
    type CoachingMoment,
    type CoachingSectionKey,
    type GroupedMoment,
    type ParsedCoachingSection,
} from "@/lib/coaching-moments";
import type { SessionFeedbackType } from "@/types/sessions";

interface CoachingMomentsViewProps {
    feedback: SessionFeedbackType;
    onSeekToSecond?: (seconds: number) => void;
    sessionId?: string;
    uid?: string;
    /** When set, only parse and render these coaching section keys. */
    visibleKeys?: Array<keyof SessionFeedbackType>;
}

export function CoachingMomentsView({
    feedback,
    onSeekToSecond,
    sessionId,
    uid,
    visibleKeys,
}: CoachingMomentsViewProps) {
    const sections = useMemo<ParsedCoachingSection[]>(() => {
        const all = parseAllCoachingSections(feedback);
        if (!visibleKeys || visibleKeys.length === 0) return all;
        const allowed = new Set(visibleKeys);
        return all.filter((s) => allowed.has(s.key));
    }, [feedback, visibleKeys]);
    const topFixes = useMemo(() => pickTopFixes(sections, 3), [sections]);
    const grouped = useMemo(() => groupMomentsByTimestamp(sections), [sections]);
    const momentsToTighten = sections.find(
        (s) => s.key === "momentsToTighten",
    )?.moments;
    const topFixIds = new Set(
        momentsToTighten
            ? momentsToTighten.slice(0, topFixes.length).map((m) => m.id)
            : [],
    );

    // Filter out groups whose only occurrences are the top fixes we already
    // showed above — avoids reading the same 0:14 moment twice.
    const remainingGroups = grouped.filter(
        (g) => !g.occurrences.every((occ) => topFixIds.has(occ.id)),
    );

    if (
        topFixes.length === 0 &&
        remainingGroups.length === 0 &&
        sections.every((s) => !s.gist)
    ) {
        return (
            <div className="rounded-xl border border-border/70 p-4">
                <p className="text-sm font-medium">Coaching</p>
                <p className="mt-2 text-sm text-muted-foreground">
                    Waiting for coaching feedback…
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {topFixes.length > 0 ? (
                <TopFixesCard
                    moments={topFixes}
                    onSeekToSecond={onSeekToSecond}
                />
            ) : null}

            {remainingGroups.length > 0 ? (
                <MomentsList
                    groups={remainingGroups}
                    onSeekToSecond={onSeekToSecond}
                />
            ) : null}

            <BigPicturePanel
                sections={sections}
                sessionId={sessionId}
                uid={uid}
                onSeekToSecond={onSeekToSecond}
            />
        </div>
    );
}

function TopFixesCard({
    moments,
    onSeekToSecond,
}: {
    moments: CoachingMoment[];
    onSeekToSecond?: (seconds: number) => void;
}) {
    return (
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">
                    Fix these first
                </h3>
                <span className="text-xs text-muted-foreground">
                    {moments.length === 1
                        ? "1 priority"
                        : `${moments.length} priorities`}
                </span>
            </div>
            <ol className="mt-4 space-y-4">
                {moments.map((moment, index) => (
                    <li
                        key={moment.id}
                        className="rounded-xl border border-border/70 bg-background p-4"
                    >
                        <TopFixContent
                            index={index + 1}
                            moment={moment}
                            onSeekToSecond={onSeekToSecond}
                        />
                    </li>
                ))}
            </ol>
        </div>
    );
}

function TopFixContent({
    index,
    moment,
    onSeekToSecond,
}: {
    index: number;
    moment: CoachingMoment;
    onSeekToSecond?: (seconds: number) => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
                    {index}
                </span>
                {moment.timestampSeconds != null ? (
                    <TimestampChip
                        label={moment.timestampLabel ?? ""}
                        seconds={moment.timestampSeconds}
                        onSeekToSecond={onSeekToSecond}
                    />
                ) : (
                    <span className="text-xs text-muted-foreground">
                        {moment.sourceKey
                            ? COACHING_SECTION_LABELS[moment.sourceKey]
                            : "Moment"}
                    </span>
                )}
            </div>

            <AnchorQuote text={moment.anchor} />

            {moment.betterOption ? (
                <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Try instead
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                        {moment.betterOption}
                    </p>
                </div>
            ) : null}

            {moment.why ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                    {moment.why}
                </p>
            ) : null}
        </div>
    );
}

function MomentsList({
    groups,
    onSeekToSecond,
}: {
    groups: GroupedMoment[];
    onSeekToSecond?: (seconds: number) => void;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-background p-5">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">
                    More moments
                </h3>
                <span className="text-xs text-muted-foreground">
                    {groups.length === 1
                        ? "1 moment"
                        : `${groups.length} moments`}
                </span>
            </div>
            <ul className="mt-4 space-y-3">
                {groups.map((group) => (
                    <li key={group.key}>
                        <MomentCard
                            group={group}
                            onSeekToSecond={onSeekToSecond}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function MomentCard({
    group,
    onSeekToSecond,
}: {
    group: GroupedMoment;
    onSeekToSecond?: (seconds: number) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const primary = pickPrimaryOccurrence(group.occurrences);
    const supplementary = group.occurrences.filter(
        (occ) => occ.id !== primary.id,
    );

    return (
        <div className="rounded-xl border border-border/60 bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
                {group.timestampSeconds != null ? (
                    <TimestampChip
                        label={group.timestampLabel ?? ""}
                        seconds={group.timestampSeconds}
                        onSeekToSecond={onSeekToSecond}
                    />
                ) : null}
                {group.dimensions.map((key) => (
                    <DimensionChip key={key} dimension={key} />
                ))}
            </div>

            <div className="mt-3">
                <AnchorQuote text={group.anchor} compact />
            </div>

            {primary.betterOption ? (
                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Try instead
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                        {primary.betterOption}
                    </p>
                </div>
            ) : null}

            {primary.why || supplementary.length > 0 ? (
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setIsExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ChevronDown
                            className={cn(
                                "size-3 transition-transform",
                                isExpanded && "rotate-180",
                            )}
                        />
                        {isExpanded ? "Hide why" : "Why this matters"}
                    </button>
                    {isExpanded ? (
                        <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">
                            {primary.why ? <p>{primary.why}</p> : null}
                            {supplementary.map((occ) =>
                                occ.why || occ.betterOption ? (
                                    <div
                                        key={occ.id}
                                        className="rounded-md border border-border/50 p-2"
                                    >
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                                            {
                                                COACHING_SECTION_LABELS[
                                                    occ.sourceKey
                                                ]
                                            }
                                        </span>
                                        {occ.why ? (
                                            <p className="mt-1">{occ.why}</p>
                                        ) : null}
                                        {occ.betterOption &&
                                        occ.betterOption !==
                                            primary.betterOption ? (
                                            <p className="mt-1 text-foreground">
                                                Try: {occ.betterOption}
                                            </p>
                                        ) : null}
                                    </div>
                                ) : null,
                            )}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function pickPrimaryOccurrence(
    occurrences: CoachingMoment[],
): CoachingMoment {
    const byPriority = [...occurrences].sort(
        (a, b) =>
            priority(a.sourceKey) - priority(b.sourceKey) ||
            score(b) - score(a),
    );
    return byPriority[0] ?? occurrences[0]!;
}

function priority(key: CoachingSectionKey): number {
    const order: CoachingSectionKey[] = [
        "momentsToTighten",
        "clarityAndConciseness",
        "structureAndFlow",
        "relevanceAndFocus",
        "engagement",
        "professionalism",
        "deliveryAndProsody",
    ];
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
}

function score(moment: CoachingMoment): number {
    return (
        (moment.betterOption ? 2 : 0) +
        (moment.why ? 1 : 0) +
        (moment.anchor ? 1 : 0)
    );
}

function TimestampChip({
    label,
    seconds,
    onSeekToSecond,
}: {
    label: string;
    seconds: number;
    onSeekToSecond?: (seconds: number) => void;
}) {
    if (!onSeekToSecond) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                {label}
            </span>
        );
    }
    return (
        <button
            type="button"
            onClick={() => onSeekToSecond(seconds)}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted/80"
        >
            <Play className="size-3" />
            {label}
        </button>
    );
}

function DimensionChip({ dimension }: { dimension: CoachingSectionKey }) {
    return (
        <span className="inline-flex items-center rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {COACHING_SECTION_LABELS[dimension]}
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
                compact ? "text-sm leading-relaxed" : "text-[15px] leading-relaxed",
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

function BigPicturePanel({
    sections,
    sessionId,
    uid,
    onSeekToSecond,
}: {
    sections: ParsedCoachingSection[];
    sessionId?: string;
    uid?: string;
    onSeekToSecond?: (seconds: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const dimensionSections = sections.filter(
        (s) => s.key !== "momentsToTighten" && (s.gist || s.moments.length > 0),
    );
    if (dimensionSections.length === 0) return null;

    return (
        <div className="rounded-2xl border border-border/70 bg-background">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between p-5"
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
                <div className="space-y-4 border-t border-border/50 p-5">
                    {dimensionSections.map((section) => (
                        <BigPictureSection
                            key={section.key}
                            section={section}
                            sessionId={sessionId}
                            uid={uid}
                            onSeekToSecond={onSeekToSecond}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function BigPictureSection({
    section,
    sessionId,
    uid,
    onSeekToSecond,
}: {
    section: ParsedCoachingSection;
    sessionId?: string;
    uid?: string;
    onSeekToSecond?: (seconds: number) => void;
}) {
    const [showChat, setShowChat] = useState(false);
    return (
        <div>
            <h4 className="text-sm font-semibold tracking-tight">
                {COACHING_SECTION_LABELS[section.key]}
            </h4>
            {section.gist ? (
                <div className="mt-2">
                    <ReactMarkdown components={gistMarkdownComponents()}>
                        {section.gist}
                    </ReactMarkdown>
                </div>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                    No headline for this dimension.
                </p>
            )}
            {sessionId && uid ? (
                <div className="mt-3">
                    {showChat ? (
                        <FeedbackChat
                            source="session"
                            sourceId={sessionId}
                            uid={uid}
                            sectionKey={section.key}
                            sectionTitle={COACHING_SECTION_LABELS[section.key]}
                            feedbackContent={buildSectionContext(section)}
                            onSeekToSecond={onSeekToSecond}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setShowChat(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                            <MessageCircle className="size-3.5" />
                            Discuss this
                        </button>
                    )}
                </div>
            ) : null}
        </div>
    );
}

function buildSectionContext(section: ParsedCoachingSection): string {
    const pieces: string[] = [];
    if (section.gist) pieces.push(section.gist);
    for (const m of section.moments) {
        const head = m.timestampLabel ? `[${m.timestampLabel}]` : "—";
        const bits = [`${head} ${m.anchor}`.trim()];
        if (m.why) bits.push(`Why: ${m.why}`);
        if (m.betterOption) bits.push(`Better: ${m.betterOption}`);
        pieces.push(`- ${bits.join(" | ")}`);
    }
    return pieces.join("\n\n");
}

function gistMarkdownComponents(): Record<
    string,
    (props: { children?: ReactNode }) => React.ReactElement
> {
    return {
        p: ({ children }) => (
            <p className="text-sm leading-relaxed text-muted-foreground">
                {children}
            </p>
        ),
        ul: ({ children }) => (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {children}
            </ul>
        ),
        ol: ({ children }) => (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {children}
            </ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
                {children}
            </strong>
        ),
    };
}
