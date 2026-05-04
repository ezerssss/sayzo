import { AlertTriangle, CircleCheck, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "warning" | "positive";

const TONE_STYLES: Record<
    Tone,
    {
        wrapper: string;
        iconBg: string;
        label: string;
        icon: LucideIcon;
    }
> = {
    warning: {
        wrapper:
            "rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20",
        iconBg:
            "bg-amber-200/60 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        label: "text-amber-800/80 dark:text-amber-300/80",
        icon: AlertTriangle,
    },
    positive: {
        wrapper:
            "rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20",
        iconBg:
            "bg-emerald-200/60 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        label: "text-emerald-800/80 dark:text-emerald-300/80",
        icon: CircleCheck,
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
    const Icon = styles.icon;
    return (
        <div className={styles.wrapper}>
            <div className="flex items-start gap-3">
                <div
                    className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        styles.iconBg,
                    )}
                >
                    <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p
                        className={cn(
                            "text-[11px] font-semibold uppercase tracking-wider",
                            styles.label,
                        )}
                    >
                        {label}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {trimmed}
                    </p>
                </div>
            </div>
        </div>
    );
}
