"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

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
                    No improved version is available for this drill yet.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03]">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="flex w-full items-center gap-2 p-5"
            >
                <Sparkles className="size-4 text-foreground" />
                <h3 className="text-sm font-semibold tracking-tight">
                    How it could sound
                </h3>
                <ChevronDown
                    className={cn(
                        "ml-auto size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                    )}
                />
            </button>
            {isOpen ? (
                <div className="space-y-4 border-t border-foreground/10 p-5">
                    <p className="text-sm text-muted-foreground">
                        Your message, rewritten the way a confident speaker
                        would deliver it. Each note shows what changed and why.
                    </p>
                    <ol className="space-y-3">
                        {blocks.map((block, index) => (
                            <li
                                key={block.id}
                                className="rounded-xl border border-border/70 bg-background p-4"
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
                                            <div className="rounded-lg bg-muted/40 p-3">
                                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                    What changed
                                                </p>
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
