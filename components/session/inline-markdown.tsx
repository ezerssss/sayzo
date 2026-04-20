"use client";

import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

type Tone = "body" | "muted" | "small-muted";

type MarkdownComponents = Record<
    string,
    (props: { children?: ReactNode }) => ReactElement
>;

const PARAGRAPH_CLASSES: Record<Tone, string> = {
    body: "text-sm leading-relaxed text-foreground",
    muted: "text-sm leading-relaxed text-muted-foreground",
    "small-muted": "text-xs leading-relaxed text-muted-foreground",
};

const LIST_CLASSES: Record<Tone, string> = {
    body: "list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground",
    muted: "list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground",
    "small-muted":
        "list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground",
};

const ORDERED_LIST_CLASSES: Record<Tone, string> = {
    body: "list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground",
    muted: "list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground",
    "small-muted":
        "list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground",
};

function buildComponents(tone: Tone): MarkdownComponents {
    return {
        p: ({ children }) => <p className={PARAGRAPH_CLASSES[tone]}>{children}</p>,
        ul: ({ children }) => <ul className={LIST_CLASSES[tone]}>{children}</ul>,
        ol: ({ children }) => (
            <ol className={ORDERED_LIST_CLASSES[tone]}>{children}</ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border/70 pl-3 italic text-muted-foreground">
                {children}
            </blockquote>
        ),
    };
}

interface PropsInterface {
    text: string | null | undefined;
    tone?: Tone;
    className?: string;
}

export function InlineMarkdown(props: Readonly<PropsInterface>) {
    const { text, tone = "body", className } = props;
    if (!text || !text.trim()) return null;
    return (
        <div className={cn("space-y-2", className)}>
            <ReactMarkdown components={buildComponents(tone)}>{text}</ReactMarkdown>
        </div>
    );
}
