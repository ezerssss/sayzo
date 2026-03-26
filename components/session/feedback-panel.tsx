"use client";

import { Sparkles } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

type MarkdownComponents = Record<
    string,
    (props: { children?: ReactNode }) => ReactElement
>;

interface PropsInterface {
    feedbackMarkdown: string;
    onSeekToSecond?: (seconds: number) => void;
    needsRetry?: boolean;
    completionReason?: string | null;
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
        <ul className="list-disc space-y-1 pl-4">{children}</ul>
    ),
    li: ({ children }) => (
        <li className="text-sm leading-relaxed text-muted-foreground">{children}</li>
    ),
    p: ({ children }) => (
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    ),
    a: ({ children, ...props }: { children?: ReactNode; href?: string }) => {
        const href = typeof props.href === "string" ? props.href : "";
        const seconds = parseTimestampHref(href);
        return (
            <a
                href={href}
                className={
                    seconds != null && onSeekToSecond
                        ? "rounded-md bg-muted px-1.5 py-0.5 text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80"
                        : "underline decoration-dotted underline-offset-2"
                }
                onClick={(event) => {
                    if (seconds == null || !onSeekToSecond) return;
                    event.preventDefault();
                    onSeekToSecond(seconds);
                }}
            >
                {children}
            </a>
        );
    },
};
}

export function FeedbackPanel(props: Readonly<PropsInterface>) {
    const { feedbackMarkdown, onSeekToSecond, needsRetry, completionReason } = props;
    return (
        <div
            className={`rounded-xl border p-4 ${
                needsRetry ? "border-amber-400/60 bg-amber-50/30" : "border-border/70"
            }`}
        >
            <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4" />
                {needsRetry ? "Feedback (retry needed)" : "Feedback"}
            </div>
            {needsRetry && completionReason ? (
                <p className="mt-2 text-sm text-amber-700">{completionReason}</p>
            ) : null}
            <div className="mt-2">
                <ReactMarkdown components={markdownComponents(onSeekToSecond)}>
                    {feedbackMarkdown}
                </ReactMarkdown>
            </div>
        </div>
    );
}

