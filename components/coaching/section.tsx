"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A major feedback section: one consistent header (optional leading icon +
 * title + optional count), optionally collapsible, over its content. This
 * shared header is what gives the card-LESS briefing sheet a repeatable
 * hierarchy — every major section anchors the same way, so the eye always knows
 * where one thing starts. Pair with <SectionStack> to separate sections with a
 * hairline rule + generous space (the editorial-document rhythm).
 */
export function Section({
    icon,
    title,
    count,
    collapsible = false,
    defaultOpen = true,
    children,
}: Readonly<{
    icon?: ReactNode;
    title: string;
    count?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    children: ReactNode;
}>) {
    const [open, setOpen] = useState(defaultOpen);
    const showContent = !collapsible || open;

    const header = (
        <>
            {icon ? (
                <span className="shrink-0 text-foreground/70">{icon}</span>
            ) : null}
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {count || collapsible ? (
                <span className="ml-auto flex items-center gap-2">
                    {count ? (
                        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                            {count}
                        </span>
                    ) : null}
                    {collapsible ? (
                        <ChevronDown
                            className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform",
                                open && "rotate-180",
                            )}
                        />
                    ) : null}
                </span>
            ) : null}
        </>
    );

    return (
        <section>
            {collapsible ? (
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center gap-2 text-left"
                >
                    {header}
                </button>
            ) : (
                <div className="flex items-center gap-2">{header}</div>
            )}
            {showContent ? <div className="mt-4">{children}</div> : null}
        </section>
    );
}

/**
 * Stacks major sections as an editorial document: a hairline rule + generous
 * vertical space between each (the big gap that says "new section"), so section
 * boundaries are unmistakable on the card-less sheet. Within-section rhythm
 * stays tight (mt-4 / divide-y) — the contrast is the hierarchy.
 */
export function SectionStack({
    children,
    className,
}: Readonly<{ children: ReactNode; className?: string }>) {
    return (
        <div
            className={cn(
                "divide-y divide-border/60 [&>*]:py-8 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0",
                className,
            )}
        >
            {children}
        </div>
    );
}
