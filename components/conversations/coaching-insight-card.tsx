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
    /**
     * "hero" (default) — the headline takeaway above the feedback tabs on the
     * conversation page. Now card-LESS (no gradient panel) so the page keeps a
     * single HeroPanel; the small tone badge + label carry the emphasis.
     * "inline" — a lighter white sub-card for embedding inside another surface
     * (e.g. the overview's latest-conversation HeroPanel), where a bare block
     * would get lost. Same content + type-coloring; clamped body.
     */
    variant?: "hero" | "inline";
};

/**
 * The single highest-impact coaching takeaway. As the `hero` it sits above the
 * feedback tabs on the conversation page; as `inline` it teases that same
 * takeaway elsewhere. `strength` gets a positive (emerald) treatment; everything
 * else uses the page's sky/indigo improvement tone.
 */
export function CoachingInsightCard({
    insight,
    variant = "hero",
}: Readonly<Props>) {
    const isStrength = insight.type === "strength";
    const isInline = variant === "inline";
    const Icon: LucideIcon = isStrength ? CircleCheck : Lightbulb;
    const label = TYPE_LABEL[insight.type] ?? TYPE_LABEL.other;

    const content = (
        <div className="flex items-start gap-3">
            <div
                className={cn(
                    "flex shrink-0 items-center justify-center rounded-full",
                    isInline ? "size-7" : "mt-0.5 size-8",
                    isStrength
                        ? "bg-emerald-200/60 text-emerald-700"
                        : "bg-sky-200/60 text-sky-700",
                )}
            >
                <Icon className={isInline ? "size-3.5" : "size-4"} />
            </div>
            <div className="min-w-0 max-w-3xl flex-1">
                <p
                    className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider",
                        isStrength ? "text-emerald-800/80" : "text-sky-800/80",
                    )}
                >
                    {label}
                </p>
                <h3
                    className={cn(
                        "mt-1 font-semibold leading-snug tracking-tight text-foreground",
                        isInline ? "text-sm" : "text-base",
                    )}
                >
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
                <p
                    className={cn(
                        "mt-2.5 text-sm leading-relaxed text-foreground",
                        isInline && "line-clamp-2",
                    )}
                >
                    {insight.body}
                </p>
                {insight.why && !isInline ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                        {insight.why}
                    </p>
                ) : null}
            </div>
        </div>
    );

    if (isInline) {
        return (
            <div
                className={cn(
                    "rounded-xl border bg-white/70 p-3.5 backdrop-blur-sm",
                    isStrength ? "border-emerald-100" : "border-sky-100",
                )}
            >
                {content}
            </div>
        );
    }
    return content;
}
