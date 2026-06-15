import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
    { title: "Install Sayzo", sub: "A one-time setup on your computer." },
    {
        title: "Join your work calls",
        sub: "Sayzo saves them in the background.",
    },
    {
        title: "Feedback shows up here",
        sub: "Notes and a Replay after every conversation.",
    },
] as const;

/**
 * The "no conversations yet" first-run state. Card-less and left-aligned so it
 * reads as native page content flowing under the header — not a boxed widget
 * floating in the off-center content pane (the sidebar makes a centered hero
 * look lopsided). Sends users to the install page (full OS-aware setup lives
 * there) rather than force-downloading.
 */
export function CapturesEmptyState() {
    return (
        <div>
            <h2 className="text-xl font-semibold tracking-tight">
                Install Sayzo to get your first feedback
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Sayzo joins the work calls you choose — feedback and a replay
                show up here after every conversation.
            </p>

            {/* The loop as a quiet connected stepper — no card around it. */}
            <ol className="mt-6">
                {STEPS.map((step, i) => {
                    const isLast = i === STEPS.length - 1;
                    return (
                        <li key={step.title} className="flex gap-3.5">
                            <div className="flex flex-col items-center">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                                    {i + 1}
                                </span>
                                {!isLast ? (
                                    <span
                                        aria-hidden
                                        className="my-1.5 w-px flex-1 bg-border"
                                    />
                                ) : null}
                            </div>
                            <div className={cn("pt-0.5", !isLast && "pb-5")}>
                                <p className="text-sm font-medium">
                                    {step.title}
                                </p>
                                <p className="mt-0.5 text-sm text-muted-foreground">
                                    {step.sub}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>

            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                    href="/install"
                    className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                >
                    See how to install
                    <ArrowRight className="size-4" />
                </Link>
                <span className="text-xs text-muted-foreground">
                    Windows &amp; macOS · about a minute
                </span>
            </div>
        </div>
    );
}
