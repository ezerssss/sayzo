import { AlertTriangle, CircleCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "warning" | "positive";

// Card-less tonal admonition: a left-accent + inline glyph + mono kicker, no
// boxed background. Keeps the semantic hue (amber = watch-out, emerald = good)
// as an accent rather than a full fill.
const TONE_STYLES: Record<
    Tone,
    {
        accent: string;
        icon: string;
        label: string;
        Icon: LucideIcon;
    }
> = {
    warning: {
        accent: "border-amber-300",
        icon: "text-amber-600",
        label: "text-amber-800/80",
        Icon: AlertTriangle,
    },
    positive: {
        accent: "border-emerald-300",
        icon: "text-emerald-600",
        label: "text-emerald-800/80",
        Icon: CircleCheck,
    },
};

type Props = {
    tone: Tone;
    label: string;
    body: string;
};

export function CalloutCard({ tone, label, body }: Readonly<Props>) {
    const trimmed = body?.trim();
    if (!trimmed) return null;
    const styles = TONE_STYLES[tone];
    const Icon = styles.Icon;
    return (
        <div className={cn("border-l-2 pl-4", styles.accent)}>
            <div className="flex items-center gap-1.5">
                <Icon className={cn("size-3.5 shrink-0", styles.icon)} />
                <p
                    className={cn(
                        "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
                        styles.label,
                    )}
                >
                    {label}
                </p>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                {trimmed}
            </p>
        </div>
    );
}
