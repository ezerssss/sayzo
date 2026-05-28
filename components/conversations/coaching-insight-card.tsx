import { CircleCheck, Lightbulb, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CoachingInsight, CoachingInsightType } from "@/schemas";

// Plain, user-facing labels — the card is the first thing the "See full
// feedback" deep-link lands on, so it must read clearly at a glance.
const TYPE_LABEL: Record<CoachingInsightType, string> = {
    rephrase: "A clearer way to say it",
    structure: "Structuring your point",
    clarity: "Making it clearer",
    pacing: "Pacing & delivery",
    strength: "What you did well",
    other: "Your top takeaway",
};

type Props = {
    insight: CoachingInsight;
};

/**
 * The single highest-impact coaching takeaway, rendered as the hero above the
 * feedback tabs on the conversation page. Same insight the desktop agent shows
 * on its small post-capture card — here it has room to breathe, with the full
 * analysis below it. `strength` gets a positive (emerald) treatment; everything
 * else uses the page's sky/indigo improvement tone.
 */
export function CoachingInsightCard({ insight }: Readonly<Props>) {
    const isStrength = insight.type === "strength";
    const Icon: LucideIcon = isStrength ? CircleCheck : Lightbulb;
    const label = TYPE_LABEL[insight.type] ?? TYPE_LABEL.other;

    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-2xl border p-5 shadow-sm sm:p-6",
                isStrength
                    ? "border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40"
                    : "border-sky-200/80 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40",
            )}
        >
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl",
                    isStrength
                        ? "bg-gradient-to-br from-emerald-200/40 to-teal-200/30"
                        : "bg-gradient-to-br from-sky-200/40 to-indigo-200/30",
                )}
            />
            <div className="relative flex items-start gap-3">
                <div
                    className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                        isStrength
                            ? "bg-emerald-200/60 text-emerald-700"
                            : "bg-sky-200/60 text-sky-700",
                    )}
                >
                    <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p
                        className={cn(
                            "text-[11px] font-semibold uppercase tracking-wider",
                            isStrength
                                ? "text-emerald-800/80"
                                : "text-sky-800/80",
                        )}
                    >
                        {label}
                    </p>
                    <h3 className="mt-1 text-base font-semibold leading-snug tracking-tight text-foreground">
                        {insight.headline}
                    </h3>
                    {insight.quote ? (
                        <p
                            className={cn(
                                "mt-2.5 border-l-2 pl-3 text-sm italic text-muted-foreground",
                                isStrength
                                    ? "border-emerald-300"
                                    : "border-sky-300",
                            )}
                        >
                            <span className="font-medium not-italic text-foreground/70">
                                You said:
                            </span>{" "}
                            &ldquo;{insight.quote}&rdquo;
                        </p>
                    ) : null}
                    <p className="mt-2.5 text-sm leading-relaxed text-foreground">
                        {insight.body}
                    </p>
                    {insight.why ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {insight.why}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
