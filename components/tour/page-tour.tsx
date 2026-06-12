"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Kicker } from "@/components/coaching/briefing";
import { Button } from "@/components/ui/button";
import { useSeenTourSteps } from "@/hooks/use-seen-tour-steps";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { TourPage } from "@/lib/analytics/events";

import { TOUR_STEPS, type TourStepDef } from "./steps";

/** Breathing room between the spotlight ring and the target's edges. */
const SPOTLIGHT_PAD = 6;
/** Gap between the spotlight and the card. */
const CARD_GAP = 12;
/** Minimum distance the card keeps from the viewport edges. */
const VIEWPORT_MARGIN = 16;
/** Frames the target may be missing before the tour moves on without it. */
const MISSING_FRAME_LIMIT = 30;
/** Settle delay before arming — rides past the StaggerItem entrance. */
const ARM_DELAY_MS = 800;

/**
 * Optimistic "already marked seen" cache shared across mounts, so finishing
 * a tour on the conversation page then hopping to a replay (one SPA session)
 * doesn't re-show shared steps while the Firestore snapshot catches up.
 */
const locallySeen = new Set<string>();

type SpotlightRect = {
    top: number;
    left: number;
    width: number;
    height: number;
    radius: string;
};

type Props = {
    page: TourPage;
    uid: string | undefined;
    /** Page content is settled (conversation analyzed / replay results shown). */
    ready: boolean;
};

function findTarget(stepId: string): HTMLElement | null {
    const nodes = document.querySelectorAll<HTMLElement>(
        `[data-tour="${stepId}"]`,
    );
    for (const el of nodes) {
        // Skip hidden instances (e.g. anchors inside an inactive, unmounted
        // tab) — first visible match in document order wins.
        if (el.getClientRects().length > 0) return el;
    }
    return null;
}

function markSeen(stepIds: string[]): void {
    const fresh = stepIds.filter((id) => !locallySeen.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) locallySeen.add(id);
    // Fire-and-forget: a lost write just means a step may show once more.
    void api
        .post("/api/tour/seen", { json: { stepIds: fresh } })
        .catch((error) => {
            console.warn("[tour] failed to mark steps seen", error);
        });
}

/**
 * One-time spotlight guide over the feedback surfaces — the briefing sheet
 * introducing itself. Steps are declared in ./steps.ts and located via
 * `data-tour` attributes; per-user seen state lives at
 * `users/{uid}.seenTourSteps`, so each step is shown exactly once and steps
 * added later appear alone as a one-step "what's new" spotlight.
 */
export function PageTour({ page, uid, ready }: Readonly<Props>) {
    const { seen, loading } = useSeenTourSteps(uid);

    // Frozen at arm time — a snapshot arriving mid-tour can't mutate the run.
    const [steps, setSteps] = useState<TourStepDef[] | null>(null);
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<SpotlightRect | null>(null);
    const [cardPos, setCardPos] = useState<{
        top: number;
        left: number;
    } | null>(null);

    const cardRef = useRef<HTMLDivElement | null>(null);
    const armedRef = useRef(false);
    const armTimerRef = useRef<number | null>(null);

    // Live snapshot read at arm-fire time. Kept in a ref so snapshot updates
    // don't restart (and thereby cancel) the settle timer.
    const seenRef = useRef(seen);
    useEffect(() => {
        seenRef.current = seen;
    }, [seen]);

    // ── Arm once: content ready + seen-state loaded → settle past the
    //    stagger entrance → freeze the available unseen steps ──
    useEffect(() => {
        if (armedRef.current || !ready || loading || !uid) return;
        armedRef.current = true;
        armTimerRef.current = window.setTimeout(() => {
            requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                    const available = TOUR_STEPS[page].filter(
                        (s) =>
                            !seenRef.current.has(s.id) &&
                            !locallySeen.has(s.id) &&
                            findTarget(s.id) !== null,
                    );
                    if (available.length === 0) return;
                    track("tour_started", {
                        page,
                        step_count: available.length,
                    });
                    setSteps(available);
                    setIndex(0);
                }),
            );
        }, ARM_DELAY_MS);
    }, [ready, loading, uid, page]);

    // Clear the settle timer on unmount only — not on snapshot re-renders.
    useEffect(
        () => () => {
            if (armTimerRef.current !== null) {
                window.clearTimeout(armTimerRef.current);
            }
        },
        [],
    );

    const step = steps?.[index] ?? null;

    const close = () => {
        setSteps(null);
        setRect(null);
        setCardPos(null);
    };

    const next = () => {
        if (!steps) return;
        if (index >= steps.length - 1) {
            track("tour_completed", { page, step_count: steps.length });
            close();
            return;
        }
        setIndex(index + 1);
    };

    const back = () => setIndex((i) => Math.max(0, i - 1));

    const skip = () => {
        if (!steps) return;
        track("tour_skipped", {
            page,
            step_id: steps[index]?.id ?? "",
            steps_remaining: steps.length - index - 1,
        });
        // Skip dismisses the whole guide: everything offered counts as seen.
        markSeen(steps.map((s) => s.id));
        close();
    };

    // Latest-instance refs so the rAF loop and window listeners stay current.
    const skipRef = useRef(skip);
    const advanceRef = useRef(() => {});
    useEffect(() => {
        skipRef.current = skip;
        advanceRef.current = () => {
            if (!steps) return;
            for (let i = index + 1; i < steps.length; i++) {
                if (findTarget(steps[i].id)) {
                    setIndex(i);
                    return;
                }
            }
            track("tour_completed", { page, step_count: steps.length });
            close();
        };
    });

    // ── On step shown: persist seen, scroll the target into view ──
    useEffect(() => {
        if (!steps) return;
        const current = steps[index];
        if (!current) return;
        track("tour_step_viewed", {
            page,
            step_id: current.id,
            step_index: index,
        });
        // Seen-on-view (not on advance): abandoning mid-tour resumes from the
        // first never-shown step instead of re-running the whole guide.
        markSeen([current.id]);
        const el = findTarget(current.id);
        if (el) {
            const reduced = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
            ).matches;
            el.scrollIntoView({
                block: "center",
                behavior: reduced ? "auto" : "smooth",
            });
        }
    }, [steps, index, page]);

    // ── Track the active target's rect every frame while open. Late layout
    //    shifts (audio player pop-in, collapsibles) and the smooth scroll all
    //    funnel through here; the spotlight's CSS transition turns the raw
    //    per-frame updates into a glide. ──
    useEffect(() => {
        if (!steps) return;
        const current = steps[index];
        if (!current) return;
        let raf = 0;
        let missing = 0;
        const tick = () => {
            const el = findTarget(current.id);
            if (!el) {
                missing += 1;
                if (missing > MISSING_FRAME_LIMIT) {
                    // Target left the page mid-tour — move on rather than
                    // spotlighting a hole.
                    advanceRef.current();
                    return;
                }
                raf = requestAnimationFrame(tick);
                return;
            }
            missing = 0;
            const r = el.getBoundingClientRect();
            const radius = window.getComputedStyle(el).borderRadius || "12px";
            setRect((prev) =>
                prev !== null &&
                Math.abs(prev.top - r.top) < 0.5 &&
                Math.abs(prev.left - r.left) < 0.5 &&
                Math.abs(prev.width - r.width) < 0.5 &&
                Math.abs(prev.height - r.height) < 0.5 &&
                prev.radius === radius
                    ? prev
                    : {
                          top: r.top,
                          left: r.left,
                          width: r.width,
                          height: r.height,
                          radius,
                      },
            );
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [steps, index]);

    // ── Escape dismisses, same contract as Skip. Backdrop click is a no-op
    //    on purpose: a stray click must not mark everything seen. ──
    useEffect(() => {
        if (!steps) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                skipRef.current();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [steps]);

    // ── Position the card around the spotlight, clamped to the viewport:
    //    below the target, flipping above when cramped, bottom-sheet as the
    //    last resort. Re-measures whenever the rect moves so card and
    //    spotlight stay glued through scrolling. ──
    useLayoutEffect(() => {
        if (!rect || !cardRef.current) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cw = cardRef.current.offsetWidth;
        const ch = cardRef.current.offsetHeight;
        let top = rect.top + rect.height + SPOTLIGHT_PAD + CARD_GAP;
        if (top + ch > vh - VIEWPORT_MARGIN) {
            top = rect.top - SPOTLIGHT_PAD - CARD_GAP - ch;
            if (top < VIEWPORT_MARGIN) top = vh - ch - VIEWPORT_MARGIN;
        }
        const left = Math.min(
            Math.max(rect.left + rect.width / 2 - cw / 2, VIEWPORT_MARGIN),
            Math.max(vw - cw - VIEWPORT_MARGIN, VIEWPORT_MARGIN),
        );
        setCardPos({ top, left });
    }, [rect, index]);

    // ── The card is a dialog: focus it on every step ──
    useEffect(() => {
        if (!steps) return;
        cardRef.current?.focus({ preventScroll: true });
    }, [steps, index]);

    // Mini focus trap — Tab cycles within the card while the tour is open.
    const onTrapKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "Tab") return;
        const card = cardRef.current;
        if (!card) return;
        const focusables = Array.from(
            card.querySelectorAll<HTMLElement>(
                "button, [href], [tabindex]:not([tabindex='-1'])",
            ),
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !card.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !card.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };

    // Steps only ever get set client-side (effects), so SSR renders nothing.
    if (!steps || !step || !rect) return null;

    const isLast = index === steps.length - 1;
    const isSolo = steps.length === 1;

    return createPortal(
        <div
            className="fixed inset-0 z-50 animate-in fade-in duration-300"
            onKeyDown={onTrapKeyDown}
        >
            {/* Spotlight: the giant box-shadow IS the dim layer, so the
                cutout comes free and the ring glides between targets on a
                plain CSS transition. Radius copied from the target so pills
                get pill-shaped halos. */}
            <div
                aria-hidden
                className="absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ring-2 ring-sky-400/70 transition-all duration-300"
                style={{
                    top: rect.top - SPOTLIGHT_PAD,
                    left: rect.left - SPOTLIGHT_PAD,
                    width: rect.width + SPOTLIGHT_PAD * 2,
                    height: rect.height + SPOTLIGHT_PAD * 2,
                    borderRadius: rect.radius,
                }}
            />
            {/* Re-keyed per step so the entrance animation re-fires. */}
            <div
                key={step.id}
                ref={cardRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="page-tour-title"
                tabIndex={-1}
                className="absolute w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-sky-100 bg-background p-4 shadow-lg outline-none animate-in fade-in zoom-in-95 duration-200 dark:border-sky-900/40"
                style={cardPos ?? { top: 0, left: 0, visibility: "hidden" }}
            >
                <Kicker>
                    {isSolo ? "New" : `Step ${index + 1} of ${steps.length}`}
                </Kicker>
                <p
                    id="page-tour-title"
                    className="mt-1.5 text-sm font-semibold tracking-tight"
                >
                    {step.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                    {isSolo ? (
                        <span />
                    ) : (
                        <button
                            type="button"
                            onClick={skip}
                            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Skip tour
                        </button>
                    )}
                    <div className="flex items-center gap-3">
                        {!isSolo && (
                            <div className="flex items-center gap-1.5">
                                {steps.map((s, i) => (
                                    <span
                                        key={s.id}
                                        className={cn(
                                            "size-1.5 rounded-full transition-colors",
                                            i === index
                                                ? "bg-sky-500"
                                                : "bg-border",
                                        )}
                                    />
                                ))}
                            </div>
                        )}
                        {index > 0 && (
                            <Button variant="ghost" size="sm" onClick={back}>
                                Back
                            </Button>
                        )}
                        <Button size="sm" onClick={next}>
                            {isSolo ? "Got it" : isLast ? "Done" : "Next"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
