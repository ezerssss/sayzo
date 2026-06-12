import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared "briefing sheet" design primitives for the post-feedback surfaces
 * (conversation detail + replay feedback — keep the two structurally unified):
 * a staggered one-time entrance and the mono uppercase micro-label. The
 * keyframes come from tw-animate-css; the inline animation-delay/fill-mode
 * make the stagger robust to utility-plugin internals.
 */
export function staggerEnter(order: number): {
    className: string;
    style: CSSProperties;
} {
    return {
        className: "animate-in fade-in slide-in-from-bottom-2 duration-500",
        style: {
            animationDelay: `${order * 70}ms`,
            animationFillMode: "both",
        },
    };
}

export function StaggerItem({
    order,
    className,
    children,
}: Readonly<{
    order: number;
    className?: string;
    children: ReactNode;
}>) {
    const enter = staggerEnter(order);
    return (
        <div className={cn(enter.className, className)} style={enter.style}>
            {children}
        </div>
    );
}

const KICKER_TONES = {
    sky: "text-sky-700/80 dark:text-sky-300/80",
    emerald: "text-emerald-700/80 dark:text-emerald-300/80",
    amber: "text-amber-800/80 dark:text-amber-300/80",
    muted: "text-muted-foreground",
} as const;

export type KickerTone = keyof typeof KICKER_TONES;

/** Mono uppercase micro-label — the briefing sheet's section voice. */
export function Kicker({
    tone = "sky",
    className,
    children,
}: Readonly<{
    tone?: KickerTone;
    className?: string;
    children: ReactNode;
}>) {
    return (
        <p
            className={cn(
                "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
                KICKER_TONES[tone],
                className,
            )}
        >
            {children}
        </p>
    );
}
