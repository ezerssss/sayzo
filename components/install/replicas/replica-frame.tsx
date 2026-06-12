import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Decorative scaffolding for the install guide's dialog depictions.
 *
 * Everything inside a ReplicaFrame is an illustration of what the user's OS
 * will show, NOT live UI: the whole frame is aria-hidden and inert, and the
 * actual instruction ("click More info, then Run anyway") must live in the
 * step text outside the frame. Depicted buttons are spans, never <button>.
 *
 * Interiors use fixed, OS-authentic colors on purpose — they portray Windows
 * and macOS, so they must not flip with the site's dark mode. Only this frame
 * (the "desk" mat around the dialog) uses theme tokens.
 */
export function ReplicaFrame({
    caption = "What you’ll see on your screen",
    className,
    children,
}: Readonly<{
    caption?: string;
    className?: string;
    children: ReactNode;
}>) {
    return (
        <figure
            aria-hidden
            className={cn(
                "pointer-events-none m-0 select-none overflow-hidden rounded-xl border border-border/60",
                "bg-gradient-to-b from-muted/40 to-muted/90",
                "[background-image:radial-gradient(color-mix(in_oklch,var(--foreground)_7%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--muted)_40%,transparent),color-mix(in_oklch,var(--muted)_90%,transparent))] [background-size:14px_14px,auto]",
                className,
            )}
        >
            <figcaption className="flex items-center gap-1.5 px-3 pt-2.5 text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                <span className="size-1.5 rounded-full bg-sky-400" />
                {caption}
            </figcaption>
            <div className="flex items-center justify-center px-4 py-5 sm:px-6">
                {children}
            </div>
        </figure>
    );
}

/**
 * Numbered "click here" badge pinned onto a depicted control.
 * Parent must be `relative`; position via className (e.g. "-right-2 -top-2").
 */
export function ClickMarker({
    number,
    className,
}: Readonly<{
    number: 1 | 2;
    className?: string;
}>) {
    return (
        <span className={cn("absolute z-10 flex size-5", className)}>
            <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/60 motion-reduce:animate-none" />
            <span className="relative flex size-5 items-center justify-center rounded-full bg-sky-500 text-[0.65rem] font-bold text-white ring-2 ring-white">
                {number}
            </span>
        </span>
    );
}
