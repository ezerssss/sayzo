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
}

const markdownComponents: MarkdownComponents = {
    h2: ({ children }) => (
        <h3 className="mt-3 text-sm font-semibold">{children}</h3>
    ),
    ul: ({ children }) => (
        <ul className="list-disc space-y-1 pl-5">{children}</ul>
    ),
    li: ({ children }) => (
        <li className="text-muted-foreground">{children}</li>
    ),
    p: ({ children }) => <p className="text-muted-foreground">{children}</p>,
};

export function FeedbackPanel(props: Readonly<PropsInterface>) {
    const { feedbackMarkdown } = props;
    return (
        <div className="rounded-xl border border-border/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4" />
                Feedback
            </div>
            <div className="mt-2">
                <ReactMarkdown components={markdownComponents}>
                    {feedbackMarkdown}
                </ReactMarkdown>
            </div>
        </div>
    );
}

