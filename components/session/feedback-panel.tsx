"use client";

import { Sparkles } from "lucide-react";
import { type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { SessionFeedbackType } from "@/types/sessions";

import { FeedbackChat } from "./feedback-chat";

type MarkdownComponents = Record<
    string,
    (props: { children?: ReactNode }) => ReactElement
>;

type FeedbackSectionKey =
    | "overview"
    | "momentsToTighten"
    | "structureAndFlow"
    | "clarityAndConciseness"
    | "relevanceAndFocus"
    | "engagement"
    | "professionalism"
    | "deliveryAndProsody"
    | "nativeSpeakerVersion";

interface PropsInterface {
    feedback: SessionFeedbackType;
    onSeekToSecond?: (seconds: number) => void;
    needsRetry?: boolean;
    completionReason?: string | null;
    variant?: "all" | "overview-only" | "without-overview";
    sectionKey?: keyof SessionFeedbackType;
    sectionKeys?: Array<keyof SessionFeedbackType>;
    showHeader?: boolean;
    sessionId?: string;
    uid?: string;
}

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
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        const ss = Number(m[3]);
        return hh * 3600 + mm * 60 + ss;
    }
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    return mm * 60 + ss;
}

function markdownComponents(
    onSeekToSecond?: (seconds: number) => void,
): MarkdownComponents {
    return {
        h2: ({ children }) => (
            <h3 className="mt-3 text-sm font-semibold text-foreground/90">
                {children}
            </h3>
        ),
        ul: ({ children }) => (
            <ul className="list-disc space-y-1.5 pl-4">{children}</ul>
        ),
        li: ({ children }) => (
            <li className="text-sm leading-relaxed text-muted-foreground">
                {children}
            </li>
        ),
        strong: ({ children }) => (
            <strong className="font-semibold text-foreground/90">{children}</strong>
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

export function FeedbackPanel(props: Readonly<PropsInterface>) {
    const {
        feedback,
        onSeekToSecond,
        needsRetry,
        completionReason,
        variant = "all",
        sectionKey,
        sectionKeys,
        showHeader = true,
        sessionId,
        uid,
    } = props;
    const sections: Array<{ key: string; title: string; content: string | null }> =
        [
            {
                key: "overview",
                title: "Overview",
                content: feedback.overview,
            },
            {
                key: "momentsToTighten",
                title: "Moments to tighten",
                content: feedback.momentsToTighten,
            },
            {
                key: "structureAndFlow",
                title: "Structure & flow",
                content: feedback.structureAndFlow,
            },
            {
                key: "clarityAndConciseness",
                title: "Clarity & conciseness",
                content: feedback.clarityAndConciseness,
            },
            {
                key: "relevanceAndFocus",
                title: "Relevance & focus",
                content: feedback.relevanceAndFocus,
            },
            {
                key: "engagement",
                title: "Engagement",
                content: feedback.engagement,
            },
            {
                key: "professionalism",
                title: "Professionalism",
                content: feedback.professionalism,
            },
            {
                key: "deliveryAndProsody",
                title: "Voice, tone & expression",
                content: feedback.deliveryAndProsody,
            },
            {
                key: "nativeSpeakerVersion",
                title: "Native speaker version",
                content: feedback.nativeSpeakerVersion,
            },
        ];
    const availableSections = sections.filter(
        (section) =>
            typeof section.content === "string" &&
            section.content.trim().length > 0,
    );
    const visibleSections = (() => {
        if (sectionKeys && sectionKeys.length > 0) {
            const keySet = new Set(sectionKeys);
            return availableSections.filter((section) =>
                keySet.has(section.key as FeedbackSectionKey),
            );
        }
        if (sectionKey) {
            return availableSections.filter((section) => section.key === sectionKey);
        }
        if (variant === "overview-only") {
            return availableSections.filter((section) => section.key === "overview");
        }
        if (variant === "without-overview") {
            return availableSections.filter((section) => section.key !== "overview");
        }
        return availableSections;
    })();

    return (
        <div
            className={`rounded-xl border p-4 ${
                needsRetry
                    ? "border-amber-400/60 bg-amber-50/30"
                    : "border-border/70"
            }`}
        >
            {showHeader ? (
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="size-4" />
                    {needsRetry ? "Feedback (retry needed)" : "Feedback"}
                </div>
            ) : null}
            {needsRetry && completionReason ? (
                <p className="mt-2 text-sm text-amber-700">
                    {completionReason}
                </p>
            ) : null}
            <div className="mt-3 space-y-3">
                {visibleSections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Feedback is not available yet.
                    </p>
                ) : null}
                {visibleSections.map((section) => (
                    <div
                        key={section.key}
                        className="rounded-lg border border-border/50 bg-background/50 p-3"
                    >
                        <h4 className="text-sm font-medium text-foreground/90">
                            {section.title}
                        </h4>
                        <div className="mt-2">
                            <ReactMarkdown
                                components={markdownComponents(onSeekToSecond)}
                                urlTransform={(url) => url}
                            >
                                {section.content ?? ""}
                            </ReactMarkdown>
                        </div>
                        {sessionId && uid && section.content ? (
                            <FeedbackChat
                                source="session"
                                sourceId={sessionId}
                                sectionKey={section.key}
                                sectionTitle={section.title}
                                feedbackContent={section.content}
                                onSeekToSecond={onSeekToSecond}
                            />
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}
