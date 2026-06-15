import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const EYEBROW_TONES = {
    sky: "text-sky-700",
    muted: "text-muted-foreground",
} as const;

export type EyebrowTone = keyof typeof EYEBROW_TONES;

/**
 * Sans uppercase micro-label — the polished "real web app" section voice used
 * across the app shell, heroes and sidebar (e.g. "Your conversation", "Recent
 * calls"). Carries the landing hero mockup's eyebrow language at real scale.
 *
 * Distinct from <Kicker> in components/coaching/briefing.tsx, which is the MONO
 * voice reserved for the briefing-sheet / transcript / tour surfaces — keep
 * using Kicker only where it already lives, and Eyebrow for shell/hero labels.
 */
export function Eyebrow({
    tone = "sky",
    className,
    children,
}: Readonly<{
    tone?: EyebrowTone;
    className?: string;
    children: ReactNode;
}>) {
    return (
        <p
            className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                EYEBROW_TONES[tone],
                className,
            )}
        >
            {children}
        </p>
    );
}
