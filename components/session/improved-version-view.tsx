"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Kicker } from "@/components/coaching/briefing";
import { InlineMarkdown } from "@/components/session/inline-markdown";
import { cn } from "@/lib/utils";

type ParagraphBlock = {
    id: string;
    paragraph: string;
    /** Inline markdown of the "what changed" note, without the `> **Note:**` prefix. */
    note: string | null;
};

interface ImprovedVersionViewProps {
    content: string;
}

export function ImprovedVersionView({ content }: ImprovedVersionViewProps) {
    const [isOpen, setIsOpen] = useState(false);
    const blocks = useMemo(() => splitIntoParagraphBlocks(content), [content]);

    if (blocks.length === 0) {
        return (
            <div className="rounded-xl border border-border/70 p-4">
                <p className="text-sm font-medium">Improved Version</p>
                <p className="mt-2 text-sm text-muted-foreground">
                    No improved version is available for this replay yet.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/60 via-white to-indigo-50/30 shadow-sm dark:border-sky-900/40 dark:from-sky-950/20 dark:via-transparent dark:to-indigo-950/10">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="flex w-full items-center gap-3 p-5"
            >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-200/60 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    <Sparkles className="size-4" />
                </span>
                <span className="flex flex-col items-start text-left">
                    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sky-700/80 dark:text-sky-300/80">
                        Improved version
                    </span>
                    <span className="mt-0.5 text-sm font-semibold tracking-tight">
                        How it could sound
                    </span>
                </span>
                <ChevronDown
                    className={cn(
                        "ml-auto size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
            {isOpen ? (
                <div className="space-y-4 border-t border-sky-100/70 p-5 dark:border-sky-900/40">
                    <p className="text-sm text-muted-foreground">
                        Your message, rewritten the way a confident speaker
                        would deliver it. Each note shows what changed and why.
                    </p>
                    <ol className="space-y-3">
                        {blocks.map((block, index) => (
                            <li
                                key={block.id}
                                className="rounded-xl border border-sky-100/70 bg-background p-4 dark:border-sky-900/30"
                            >
                                <div className="flex gap-3">
                                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <div className="flex-1 space-y-3">
                                        <p className="text-[15px] leading-relaxed text-foreground">
                                            {block.paragraph}
                                        </p>
                                        {block.note ? (
                                            <div className="rounded-lg bg-sky-50/60 p-3 dark:bg-sky-950/20">
                                                <Kicker>What changed</Kicker>
                                                <div className="mt-1">
                                                    <InlineMarkdown
                                                        text={block.note}
                                                        tone="small-muted"
                                                    />
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            ) : null}
        </div>
    );
}

function splitIntoParagraphBlocks(markdown: string): ParagraphBlock[] {
    const normalized = markdown.replaceAll(/\r\n/g, "\n").trim();
    if (!normalized) return [];

    const lines = normalized.split("\n");
    const blocks: ParagraphBlock[] = [];
    let paragraphLines: string[] = [];
    let noteLines: string[] = [];
    let mode: "paragraph" | "note" = "paragraph";

    const flush = () => {
        const paragraph = paragraphLines.join(" ").trim();
        const noteRaw = noteLines.join(" ").trim();
        const note = noteRaw
            ? noteRaw.replace(/^\*\*Note:\*\*\s*/i, "").trim() || noteRaw
            : null;
        if (paragraph || note) {
            blocks.push({
                id: `block-${blocks.length}`,
                paragraph,
                note,
            });
        }
        paragraphLines = [];
        noteLines = [];
        mode = "paragraph";
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (paragraphLines.length || noteLines.length) flush();
            continue;
        }
        if (line.startsWith(">")) {
            mode = "note";
            noteLines.push(line.replace(/^\s*>\s?/, "").trim());
            continue;
        }
        if (mode === "note") {
            // Paragraph line after a note → new block.
            flush();
        }
        paragraphLines.push(line);
    }
    flush();

    return blocks;
}
