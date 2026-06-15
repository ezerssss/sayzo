import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The page header block — an EDITORIAL header, not a card. Its content (eyebrow
 * + title + meta) sits directly on the page background and closes with a single
 * hairline rule that begins the briefing sheet below it. Formerly a sky/indigo
 * gradient card; the whole /app was moved off boxy cards (see memory
 * project_sayzo_app_cardless), and the user chose a pure-typography header over
 * a gradient panel. The name + API are kept so every header surface (overview,
 * conversation, replay, focus) shares one treatment.
 */
export function HeroPanel({
    className,
    children,
}: Readonly<{
    className?: string;
    children: ReactNode;
}>) {
    return (
        <div className={cn("border-b border-border/60 pb-6", className)}>
            {children}
        </div>
    );
}
