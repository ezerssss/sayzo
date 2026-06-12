"use client";

import {
    CalendarClock,
    Check,
    ChevronDown,
    CircleCheck,
    Copy,
    NotebookText,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Kicker, staggerEnter } from "@/components/coaching/briefing";
import { cn } from "@/lib/utils";
import type { MeetingSummary, MeetingSummaryActionItem } from "@/schemas";

/**
 * The meeting summary, embedded in the conversation hero where the one-line
 * server summary used to be: the TL;DR replaces that line, and a glanceable
 * chip row (to-do count, decisions, nearest deadline) expands the full
 * briefing (what happened, action-item checklist, what's coming) in place —
 * compact by default, but the chips keep the key facts visible so the notes
 * can't be missed. Server-grounded: every deadline/name/number was verified
 * against the transcript before storage, so this renders verbatim. Sections
 * with nothing in them are omitted; a casual chat is just the TL;DR with
 * nothing to expand.
 *
 * Check-offs are a local convenience (per-browser, localStorage keyed by
 * capture) — nothing is written to the server.
 */

const checksStorageKey = (captureId: string) =>
    `sayzo:summary-checks:${captureId}`;

function loadChecks(captureId: string): number[] {
    try {
        const raw = window.localStorage.getItem(checksStorageKey(captureId));
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.filter((n): n is number => Number.isInteger(n))
            : [];
    } catch {
        return [];
    }
}

function saveChecks(captureId: string, checked: number[]): void {
    try {
        window.localStorage.setItem(
            checksStorageKey(captureId),
            JSON.stringify(checked),
        );
    } catch {
        // Storage full / blocked — check-offs just won't persist.
    }
}

/** Plain-text rendering for the copy button — pasteable into chat or email. */
function summaryToPlainText(summary: MeetingSummary): string {
    const lines: string[] = [summary.tldr];
    const item = (i: MeetingSummaryActionItem) =>
        `- ${i.text}${i.deadline ? ` (${i.deadline})` : ""}`;

    if (summary.whatHappened.length > 0) {
        lines.push("", "What happened:");
        for (const b of summary.whatHappened) {
            lines.push(`- ${b.isDecision ? "Decision: " : ""}${b.text}`);
        }
    }
    if (summary.yourActionItems.length > 0) {
        lines.push("", "What you need to do:");
        lines.push(...summary.yourActionItems.map(item));
    }
    if (summary.othersActionItems.length > 0) {
        lines.push("", "What others are doing:");
        lines.push(...summary.othersActionItems.map(item));
    }
    if (summary.comingUp) {
        lines.push("", `Coming up: ${summary.comingUp}`);
    }
    return lines.join("\n");
}

function Section({
    label,
    count,
    order,
    children,
}: Readonly<{
    label: string;
    count?: string;
    order: number;
    children: React.ReactNode;
}>) {
    const enter = staggerEnter(order);
    return (
        <div
            className={cn(
                "flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:gap-4 sm:px-5",
                enter.className,
            )}
            style={enter.style}
        >
            <Kicker className="shrink-0 pt-0.5 leading-4 sm:w-24">
                {label}
                {count ? (
                    <span className="ml-1.5 rounded bg-sky-100/80 px-1 py-px tracking-normal text-sky-700">
                        {count}
                    </span>
                ) : null}
            </Kicker>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function DeadlineChip({ deadline }: Readonly<{ deadline: string }>) {
    return (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap rounded-md border border-sky-200/70 bg-sky-50/80 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-sky-700">
            <CalendarClock className="size-3" />
            {deadline}
        </span>
    );
}

export function MeetingSummaryHero({
    captureId,
    summary,
}: Readonly<{ captureId: string; summary: MeetingSummary }>) {
    const [expanded, setExpanded] = useState(false);
    const [checked, setChecked] = useState<number[]>([]);
    const [copied, setCopied] = useState(false);

    // localStorage is read after mount so SSR and first client render match.
    useEffect(() => {
        setChecked(loadChecks(captureId));
    }, [captureId]);

    const toggleChecked = (idx: number) => {
        setChecked((prev) => {
            const next = prev.includes(idx)
                ? prev.filter((i) => i !== idx)
                : [...prev, idx];
            saveChecks(captureId, next);
            return next;
        });
    };

    const handleCopy = () => {
        void navigator.clipboard
            .writeText(summaryToPlainText(summary))
            .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {
                // Clipboard blocked — the button just stays idle.
            });
    };

    const todoCount = summary.yourActionItems.length;
    const doneCount = summary.yourActionItems.filter((_, i) =>
        checked.includes(i),
    ).length;
    const decisionCount = summary.whatHappened.filter(
        (b) => b.isDecision,
    ).length;
    // Earliest-mentioned deadline for the collapsed chip row — the user's own
    // items first (theirs matter most), already transcript-phrased and short.
    const firstDeadline =
        summary.yourActionItems.find((i) => i.deadline)?.deadline ??
        summary.othersActionItems.find((i) => i.deadline)?.deadline ??
        null;
    const hasDetails =
        summary.whatHappened.length > 0 ||
        todoCount > 0 ||
        summary.othersActionItems.length > 0 ||
        Boolean(summary.comingUp);

    // One quiet line of contents for the collapsed bar — plain text with
    // middots, deliberately not chips (the hero meta row below already has
    // badge-shaped elements; two competing chip rows read as clutter).
    const readoutParts: string[] = [];
    if (todoCount > 0) {
        readoutParts.push(
            `${doneCount > 0 ? `${doneCount}/${todoCount}` : todoCount} ${todoCount === 1 ? "to-do" : "to-dos"} for you`,
        );
    }
    if (decisionCount > 0) {
        readoutParts.push(
            `${decisionCount} ${decisionCount === 1 ? "decision" : "decisions"}`,
        );
    }
    if (firstDeadline) readoutParts.push(firstDeadline);
    const readout = readoutParts.join(" · ");

    let order = 0;

    return (
        <div>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-foreground/80">
                {summary.tldr}
            </p>

            {/* The folded document edge: one glassy bar that IS the top of
                the briefing sheet. Collapsed, it shows a quiet mono readout
                of what's inside (to-dos, decisions, nearest deadline);
                tapping it unfolds the sections within the same container, so
                collapsed and expanded are one object — not a link plus a
                separate panel. */}
            {hasDetails && (
                <div className="mt-3 overflow-hidden rounded-xl border border-sky-100 bg-white/70 shadow-sm backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                        className="group flex w-full min-w-0 items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-sky-50/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500"
                    >
                        <NotebookText className="size-3.5 shrink-0 text-sky-700" />
                        <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sky-700/80">
                            Meeting notes
                        </span>
                        {readout ? (
                            <>
                                <span
                                    aria-hidden
                                    className="h-3 w-px shrink-0 bg-sky-200/80"
                                />
                                <span className="min-w-0 truncate font-mono text-[11px] leading-4 text-muted-foreground">
                                    {readout}
                                </span>
                            </>
                        ) : null}
                        <ChevronDown
                            className={cn(
                                "ml-auto size-4 shrink-0 text-sky-700/60 transition-transform duration-200 group-hover:text-sky-700",
                                expanded
                                    ? "rotate-180"
                                    : "group-hover:translate-y-px",
                            )}
                        />
                    </button>

                    {expanded && (
                        <div className="divide-y divide-sky-100/70 border-t border-sky-100/70">
                    {summary.whatHappened.length > 0 && (
                        <Section label="What happened" order={order++}>
                            <ul className="space-y-2.5">
                                {summary.whatHappened.map((bullet, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2.5"
                                    >
                                        {bullet.isDecision ? (
                                            <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                                                <CircleCheck className="size-3" />
                                            </span>
                                        ) : (
                                            <span
                                                aria-hidden
                                                className="mx-[5px] mt-[7px] size-2 shrink-0 rounded-full border-2 border-sky-300"
                                            />
                                        )}
                                        <p className="text-sm leading-relaxed text-foreground">
                                            {bullet.isDecision ? (
                                                <span className="mr-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-emerald-700">
                                                    Decision
                                                </span>
                                            ) : null}
                                            {bullet.text}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    {todoCount > 0 && (
                        <Section
                            label="What you need to do"
                            count={
                                doneCount > 0
                                    ? `${doneCount}/${todoCount}`
                                    : `${todoCount}`
                            }
                            order={order++}
                        >
                            <ul className="-mx-2 space-y-0.5">
                                {summary.yourActionItems.map((item, i) => {
                                    const done = checked.includes(i);
                                    return (
                                        <li key={i}>
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={done}
                                                onClick={() =>
                                                    toggleChecked(i)
                                                }
                                                className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sky-50/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-500"
                                            >
                                                <span
                                                    aria-hidden
                                                    className={cn(
                                                        "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200",
                                                        done
                                                            ? "border-sky-600 bg-sky-600"
                                                            : "border-sky-300 bg-white group-hover:border-sky-400",
                                                    )}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "size-3 text-white transition-transform duration-200",
                                                            done
                                                                ? "scale-100"
                                                                : "scale-0",
                                                        )}
                                                    />
                                                </span>
                                                <span
                                                    className={cn(
                                                        "flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1 text-sm leading-relaxed transition-colors",
                                                        done
                                                            ? "text-muted-foreground line-through decoration-sky-300"
                                                            : "text-foreground",
                                                    )}
                                                >
                                                    {item.text}
                                                    {item.deadline ? (
                                                        <DeadlineChip
                                                            deadline={
                                                                item.deadline
                                                            }
                                                        />
                                                    ) : null}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </Section>
                    )}

                    {summary.othersActionItems.length > 0 && (
                        <Section
                            label="What others are doing"
                            count={`${summary.othersActionItems.length}`}
                            order={order++}
                        >
                            <ul className="space-y-2.5">
                                {summary.othersActionItems.map((item, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-2.5"
                                    >
                                        {/* Dashed open circle: someone else's
                                            work, pending — not the user's to
                                            check off. */}
                                        <span
                                            aria-hidden
                                            className="mx-px mt-[3px] size-4 shrink-0 rounded-full border-2 border-dashed border-slate-300"
                                        />
                                        <span className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1 text-sm leading-relaxed text-foreground">
                                            {item.text}
                                            {item.deadline ? (
                                                <DeadlineChip
                                                    deadline={item.deadline}
                                                />
                                            ) : null}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    {summary.comingUp && (
                        <div
                            className={cn(
                                "bg-gradient-to-r from-sky-50/70 to-indigo-50/40 px-4 py-3.5 sm:px-5",
                                staggerEnter(order).className,
                            )}
                            style={staggerEnter(order++).style}
                        >
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                                    <CalendarClock className="size-3.5" />
                                </span>
                                <div className="min-w-0">
                                    <Kicker>Coming up</Kicker>
                                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                                        {summary.comingUp}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sheet footer: the copy action lives with the notes it
                        copies, keeping the header bar a pure toggle. */}
                    <div
                        className={cn(
                            "flex justify-end px-3 py-1.5",
                            staggerEnter(order).className,
                        )}
                        style={staggerEnter(order++).style}
                    >
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                        >
                            {copied ? (
                                <>
                                    <Check className="size-3 text-emerald-600" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="size-3" />
                                    Copy notes
                                </>
                            )}
                        </button>
                    </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
