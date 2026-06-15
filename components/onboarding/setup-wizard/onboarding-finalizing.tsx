"use client";

import { CheckCircle2, Loader2 } from "lucide-react";

import { AmbientBackdrop } from "@/components/app/ambient-backdrop";

import { OnboardingInstall } from "./onboarding-install";

// Neutral, non-sample-specific — honest whether the user recorded a sample or
// skipped (a skip has no transcript, so the server returns fast).
export const LOADING_STAGES = [
    "Setting up your profile",
    "Preparing your coaching",
    "Almost there",
] as const;

interface PropsInterface {
    stageIndex: number;
    error?: string | null;
}

/**
 * The "Getting things ready" finalize screen, shown while the profile builds
 * after the voice sample (or a skip). Purely presentational — takes only a
 * stage index + optional error, no auth/Firestore — so it can also be rendered
 * by the temporary preview route. Vertically centered to match the recording
 * step, with a cardless install prompt that fits the voice-orb flow.
 */
export function OnboardingFinalizing(props: Readonly<PropsInterface>) {
    const { stageIndex, error } = props;
    const currentStage = LOADING_STAGES[stageIndex] ?? "Almost there";

    return (
        <section className="fixed inset-0 overflow-y-auto bg-background">
            <AmbientBackdrop />
            <div className="relative flex min-h-full items-center justify-center p-6">
                <div className="flex w-full max-w-sm flex-col items-center text-center">
                    {/* Same voice-orb language as the recording step — here it
                        spins while we build the profile. */}
                    <div className="relative flex size-24 items-center justify-center">
                        <div
                            aria-hidden
                            className="absolute inset-2 rounded-full bg-gradient-to-br from-sky-400/30 to-indigo-500/30 blur-2xl motion-safe:animate-pulse"
                        />
                        <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-xl shadow-sky-600/30 ring-1 ring-inset ring-white/20">
                            <Loader2 className="size-8 animate-spin" />
                        </div>
                    </div>

                    <h1 className="mt-6 text-2xl font-semibold tracking-tight">
                        Getting things ready
                    </h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        {currentStage}…
                    </p>

                    <div className="mt-6 flex w-full max-w-xs flex-col gap-2.5">
                        {LOADING_STAGES.map((stage, i) => {
                            const done = i < stageIndex;
                            const active = i === stageIndex;
                            let statusIcon;
                            if (done) {
                                statusIcon = (
                                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                                );
                            } else if (active) {
                                statusIcon = (
                                    <Loader2 className="size-4 shrink-0 animate-spin text-sky-600" />
                                );
                            } else {
                                statusIcon = (
                                    <div className="size-4 shrink-0 rounded-full border border-border" />
                                );
                            }
                            return (
                                <div
                                    key={stage}
                                    className="flex items-center gap-2.5 text-left text-sm"
                                >
                                    {statusIcon}
                                    <span
                                        className={
                                            done || active
                                                ? "text-foreground"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        {stage}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {error ? (
                        <p
                            className="mt-4 text-sm text-destructive"
                            role="alert"
                        >
                            {error}
                        </p>
                    ) : null}

                    {/* Hairline divider between "we're working" and "your move". */}
                    <div className="my-8 h-px w-full max-w-xs bg-border/60" />

                    <OnboardingInstall />
                </div>
            </div>
        </section>
    );
}
