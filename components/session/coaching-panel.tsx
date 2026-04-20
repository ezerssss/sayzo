"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { FeedbackChat } from "@/components/session/feedback-chat";
import { cn } from "@/lib/utils";
import type { SessionFeedbackType } from "@/types/sessions";

type MarkdownComponents = Record<
    string,
    (props: { children?: ReactNode }) => React.ReactElement
>;

const SECTION_META: Array<{
    key: keyof SessionFeedbackType;
    title: string;
}> = [
    { key: "momentsToTighten", title: "Moments to tighten" },
    { key: "structureAndFlow", title: "Structure & flow" },
    { key: "clarityAndConciseness", title: "Clarity & conciseness" },
    { key: "relevanceAndFocus", title: "Relevance & focus" },
    { key: "engagement", title: "Engagement" },
    { key: "professionalism", title: "Professionalism" },
    { key: "deliveryAndProsody", title: "Voice, tone & expression" },
];

function parseTimestampHref(href: string): number | null {
    const value = decodeURIComponent(href.trim().toLowerCase());
    const timePattern = /(?:^|\/)time:(\d+(?:\.\d+)?)(?:$|[/?#])/;
    const timeMatch = timePattern.exec(value);
    if (timeMatch?.[1]) {
        const maybe = Number(timeMatch[1]);
        return Number.isFinite(maybe) ? maybe : null;
    }
    if (value.startsWith("#t=")) {
        const maybe = Number(value.replace("#t=", ""));
        return Number.isFinite(maybe) ? maybe : null;
    }
    return null;
}

function parseTimestampFromChildren(children?: ReactNode): number | null {
    if (typeof children === "string") {
        const cleaned = children.trim().replaceAll(/^\[|\]$/g, "");
        return parseTimestampToken(cleaned);
    }
    if (Array.isArray(children) && children.length === 1) {
        const first = children[0];
        if (typeof first === "string") {
            const cleaned = first.trim().replaceAll(/^\[|\]$/g, "");
            return parseTimestampToken(cleaned);
        }
    }
    return null;
}

function parseTimestampToken(token: string): number | null {
    const tokenPattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
    const m = tokenPattern.exec(token);
    if (!m) return null;
    if (m[3] != null) {
        return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    return Number(m[1]) * 60 + Number(m[2]);
}

function mdComponents(
    onSeekToSecond?: (seconds: number) => void,
): MarkdownComponents {
    return {
        h2: ({ children }) => (
            <h3 className="mt-2 text-sm font-semibold text-foreground/90">
                {children}
            </h3>
        ),
        ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-4">{children}</ul>
        ),
        li: ({ children }) => (
            <li className="text-sm leading-relaxed text-muted-foreground">
                {children}
            </li>
        ),
        strong: ({ children }) => (
            <strong className="font-semibold text-foreground/90">
                {children}
            </strong>
        ),
        p: ({ children }) => (
            <p className="text-sm leading-relaxed text-muted-foreground">
                {children}
            </p>
        ),
        a: ({
            children,
            ...props
        }: {
            children?: ReactNode;
            href?: string;
        }) => {
            const href = typeof props.href === "string" ? props.href : "";
            const seconds =
                parseTimestampHref(href) ??
                parseTimestampFromChildren(children);
            if (seconds != null && onSeekToSecond) {
                return (
                    <button
                        type="button"
                        className="rounded-md bg-muted font-normal px-1.5 py-0.5 text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80"
                        onClick={() => onSeekToSecond(seconds)}
                    >
                        {children}
                    </button>
                );
            }
            return (
                <a
                    href={href}
                    className="underline decoration-dotted underline-offset-2"
                >
                    {children}
                </a>
            );
        },
    };
}

interface CoachingPanelProps {
    feedback: SessionFeedbackType;
    onSeekToSecond?: (seconds: number) => void;
    sessionId?: string;
    uid?: string;
    /** When set, only show these coaching section keys (in order). */
    visibleKeys?: Array<keyof SessionFeedbackType>;
}

export function CoachingPanel({
    feedback,
    onSeekToSecond,
    sessionId,
    uid,
    visibleKeys,
}: CoachingPanelProps) {
    const allSections = SECTION_META.filter((s) => {
        const value = feedback[s.key];
        return typeof value === "string" && value.trim().length > 0;
    });
    const sections = visibleKeys
        ? allSections.filter((s) => visibleKeys.includes(s.key))
        : allSections;

    const [openKeys, setOpenKeys] = useState<Set<string>>(() => {
        // Auto-expand the first section
        return new Set(sections[0] ? [sections[0].key] : []);
    });

    const toggle = (key: string) => {
        setOpenKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const components = mdComponents(onSeekToSecond);

    if (sections.length === 0) {
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
        <div className="space-y-2">
            {sections.map((section) => {
                const isOpen = openKeys.has(section.key);
                const content = feedback[section.key] as string;

                return (
                    <div
                        key={section.key}
                        className="rounded-xl border border-border/70"
                    >
                        <button
                            type="button"
                            onClick={() => toggle(section.key)}
                            className="flex w-full items-center justify-between px-4 py-3"
                        >
                            <span className="text-sm font-medium">
                                {section.title}
                            </span>
                            <ChevronDown
                                className={cn(
                                    "size-4 text-muted-foreground transition-transform",
                                    isOpen && "rotate-180",
                                )}
                            />
                        </button>
                        {isOpen ? (
                            <div className="border-t border-border/50 px-4 pb-4 pt-3">
                                <ReactMarkdown
                                    components={components}
                                    urlTransform={(url) => url}
                                >
                                    {content}
                                </ReactMarkdown>
                                {sessionId && uid ? (
                                    <FeedbackChat
                                        source="session"
                                        sourceId={sessionId}
                                        sectionKey={section.key}
                                        sectionTitle={section.title}
                                        feedbackContent={content}
                                        onSeekToSecond={onSeekToSecond}
                                    />
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
