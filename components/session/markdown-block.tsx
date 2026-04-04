"use client";

import type { ReactElement, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

type MarkdownComponents = Record<
    string,
    (props: { children?: ReactNode }) => ReactElement
>;

const markdownComponents: MarkdownComponents = {
    h1: ({ children }) => (
        <h3 className="text-sm font-semibold tracking-tight">{children}</h3>
    ),
    h2: ({ children }) => (
        <h3 className="text-sm font-semibold tracking-tight">{children}</h3>
    ),
    h3: ({ children }) => (
        <h4 className="text-sm font-semibold tracking-tight">{children}</h4>
    ),
    p: ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>,
    ul: ({ children }) => (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {children}
        </ul>
    ),
    ol: ({ children }) => (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {children}
        </ol>
    ),
    li: ({ children }) => <li>{children}</li>,
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-border pl-3 text-xs text-muted-foreground italic">
            {children}
        </blockquote>
    ),
    strong: ({ children }) => (
        <strong className="font-medium text-foreground">{children}</strong>
    ),
};

interface PropsInterface {
    markdown: string;
    className?: string;
}

export function MarkdownBlock(props: Readonly<PropsInterface>) {
    const { markdown, className } = props;
    return (
        <div className={className}>
            <ReactMarkdown components={markdownComponents}>
                {markdown}
            </ReactMarkdown>
        </div>
    );
}

