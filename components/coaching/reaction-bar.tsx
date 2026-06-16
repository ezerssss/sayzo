"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

import { Kicker, type KickerTone } from "@/components/coaching/briefing";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
    ItemReaction,
    ReactionRating,
    ReactionReasonCode,
    ReactionSource,
    ReactionTarget,
} from "@/schemas";

type ReasonChip = { code: ReactionReasonCode; label: string };

const DOWN_REASONS: ReasonChip[] = [
    { code: "inaccurate", label: "Not quite right" },
    { code: "too_harsh", label: "Too harsh" },
    { code: "confusing", label: "Confusing" },
    { code: "not_helpful", label: "Not helpful" },
    { code: "other", label: "Something else" },
];

const UP_REASONS: ReasonChip[] = [
    { code: "helpful", label: "Spot on" },
    { code: "other", label: "Something else" },
];

export function ReactionBar({
    source,
    itemId,
    target = "overall",
}: {
    source: ReactionSource;
    itemId: string;
    target?: ReactionTarget;
}) {
    const [rating, setRating] = useState<ReactionRating | null>(null);
    const [reasonCode, setReasonCode] = useState<ReactionReasonCode | null>(
        null,
    );
    const [reason, setReason] = useState("");
    const [savedReason, setSavedReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await api
                    .get("/api/reactions", {
                        searchParams: { source, itemId, target },
                    })
                    .json<{ reaction: ItemReaction | null }>();
                if (cancelled || !res.reaction) return;
                setRating(res.reaction.rating);
                setReasonCode(res.reaction.reasonCode);
                setReason(res.reaction.reason ?? "");
                setSavedReason(res.reaction.reason ?? "");
            } catch {
                // Signed out or not yet rated — leave the bar in its empty state.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [source, itemId, target]);

    useEffect(() => {
        return () => {
            if (savedTimer.current) clearTimeout(savedTimer.current);
        };
    }, []);

    const flashSaved = () => {
        setJustSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setJustSaved(false), 1800);
    };

    const save = async (next: {
        rating: ReactionRating;
        reasonCode: ReactionReasonCode | null;
        reason: string | null;
    }) => {
        setSaving(true);
        try {
            await api.post("/api/reactions", {
                json: { source, itemId, target, ...next },
            });
            setSavedReason(next.reason ?? "");
            flashSaved();
        } catch {
            // Reactions are low-stakes; stay silent rather than alarm the user.
        } finally {
            setSaving(false);
        }
    };

    const onThumb = (next: ReactionRating) => {
        setRating(next);
        void save({ rating: next, reasonCode, reason: reason || null });
    };

    const onChip = (code: ReactionReasonCode) => {
        if (!rating) return;
        const nextCode = reasonCode === code ? null : code;
        setReasonCode(nextCode);
        void save({ rating, reasonCode: nextCode, reason: reason || null });
    };

    const chips = rating === "down" ? DOWN_REASONS : UP_REASONS;
    const reasonDirty = reason.trim() !== savedReason.trim();

    // Left-accent tint follows the rating, matching the briefing-sheet's tonal
    // notice language (see SessionFeedbackSection). Muted until the user reacts.
    const accentBorder =
        rating === "up"
            ? "border-emerald-400/70"
            : rating === "down"
              ? "border-amber-400/70"
              : "border-border";
    const kickerTone: KickerTone =
        rating === "up" ? "emerald" : rating === "down" ? "amber" : "muted";

    return (
        <div
            data-tour="rate-feedback"
            className={cn("border-l-2 pl-4 transition-colors", accentBorder)}
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Kicker tone={kickerTone}>Was this helpful?</Kicker>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={rating === "up" ? "default" : "outline"}
                        onClick={() => onThumb("up")}
                        aria-pressed={rating === "up"}
                    >
                        <ThumbsUp className="size-3.5" />
                        Helpful
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={rating === "down" ? "default" : "outline"}
                        onClick={() => onThumb("down")}
                        aria-pressed={rating === "down"}
                    >
                        <ThumbsDown className="size-3.5" />
                        Not helpful
                    </Button>
                    {saving ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : justSaved ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3.5" />
                            Thanks
                        </span>
                    ) : null}
                </div>
            </div>

            {rating ? (
                <div className="mt-3 flex flex-col gap-2 duration-300 animate-in fade-in slide-in-from-top-1">
                    <div className="flex flex-wrap gap-1.5">
                        {chips.map((c) => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => onChip(c.code)}
                                className={cn(
                                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                    reasonCode === c.code
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border text-muted-foreground hover:text-foreground",
                                )}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-end gap-2">
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={280}
                            rows={2}
                            placeholder="Tell your coach more (optional)"
                            className="min-h-0 flex-1 resize-none text-sm"
                        />
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!reasonDirty || saving}
                            onClick={() =>
                                void save({
                                    rating,
                                    reasonCode,
                                    reason: reason.trim() || null,
                                })
                            }
                        >
                            Save
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
