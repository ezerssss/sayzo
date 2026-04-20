import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RewriteVerdict, TurnRewrite } from "@/types/captures";

const VERDICT_LABELS: Record<RewriteVerdict, string> = {
    keep: "Already strong",
    tighten: "Tighten",
    sharpen: "Sharpen",
    reframe: "Reframe",
    reorder: "Reorder",
};

const VERDICT_TONES: Record<RewriteVerdict, string> = {
    keep: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    tighten: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    sharpen: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    reframe: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    reorder: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function VerdictPill({ verdict }: { verdict: RewriteVerdict }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                VERDICT_TONES[verdict],
            )}
        >
            {VERDICT_LABELS[verdict]}
        </span>
    );
}

function WhatChangedBox({ note }: { note: string }) {
    return (
        <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                What changed
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {note}
            </p>
        </div>
    );
}

type Props = {
    rewrite: TurnRewrite;
    /**
     * "standalone" renders the full card with original (strikethrough when
     * the rewrite differs), rewrite, and note — used on the Rewrites tab.
     * "embedded" assumes the caller already shows the original line, so the
     * card only contains the verdict pill, rewrite body, and note — used in
     * the transcript view's inline expansion.
     */
    variant: "standalone" | "embedded";
    /** Click handler for the `suggestedBeforeIdx` chip on `reorder` entries. */
    onSuggestedIdxClick?: (idx: number) => void;
};

export function TurnRewriteCard({
    rewrite,
    variant,
    onSuggestedIdxClick,
}: Readonly<Props>) {
    const { verdict, original, rewrite: improved, note, suggestedBeforeIdx } =
        rewrite;

    const rewriteDiffers = improved.trim() !== original.trim();
    const showRewrite = verdict !== "keep" && rewriteDiffers;

    if (variant === "embedded") {
        return (
            <div className="rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-foreground" />
                    <VerdictPill verdict={verdict} />
                </div>
                {showRewrite ? (
                    <p className="mt-3 text-sm leading-relaxed text-foreground">
                        {improved}
                    </p>
                ) : (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground italic">
                        This turn already works — no change needed.
                    </p>
                )}
                {verdict === "reorder" &&
                    typeof suggestedBeforeIdx === "number" && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            Would have fit better before turn{" "}
                            <button
                                type="button"
                                onClick={() =>
                                    onSuggestedIdxClick?.(suggestedBeforeIdx)
                                }
                                className="underline hover:text-foreground"
                            >
                                #{suggestedBeforeIdx}
                            </button>
                            .
                        </p>
                    )}
                {note && (
                    <div className="mt-3">
                        <WhatChangedBox note={note} />
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <VerdictPill verdict={verdict} />
            <p
                className={cn(
                    "text-xs leading-relaxed",
                    showRewrite
                        ? "text-muted-foreground line-through"
                        : "text-foreground",
                )}
            >
                {original}
            </p>
            {showRewrite && (
                <p className="text-[15px] leading-relaxed text-foreground">
                    {improved}
                </p>
            )}
            {verdict === "reorder" &&
                typeof suggestedBeforeIdx === "number" && (
                    <p className="text-[11px] text-muted-foreground">
                        Would have fit better before turn{" "}
                        <button
                            type="button"
                            onClick={() =>
                                onSuggestedIdxClick?.(suggestedBeforeIdx)
                            }
                            className="underline hover:text-foreground"
                        >
                            #{suggestedBeforeIdx}
                        </button>
                        .
                    </p>
                )}
            {note && <WhatChangedBox note={note} />}
        </div>
    );
}
