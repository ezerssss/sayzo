import { ArrowRight } from "lucide-react";

import { MarkdownBlock } from "@/components/session/markdown-block";
import { Button } from "@/components/ui/button";
import type { SessionPlanType } from "@/types/sessions";

type Props = {
    plan: SessionPlanType;
    shouldShowResults: boolean;
    loadingSession: boolean;
    isCreatingDrill: boolean;
    requiresRetry: boolean;
    reflectionModalOpen: boolean;
    reflectionSubmitting: boolean;
    skipSubmitting: boolean;
    onStartAnotherDrill: () => void;
};

export function DrillBriefCard(props: Readonly<Props>) {
    const {
        plan,
        shouldShowResults,
        loadingSession,
        isCreatingDrill,
        requiresRetry,
        reflectionModalOpen,
        reflectionSubmitting,
        skipSubmitting,
        onStartAnotherDrill,
    } = props;

    const question = plan.scenario.question?.trim();

    return (
        <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Today&apos;s Drill
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                        {plan.scenario.title}
                    </h2>
                </div>
                {shouldShowResults ? (
                    <Button
                        onClick={() => void onStartAnotherDrill()}
                        disabled={
                            loadingSession ||
                            isCreatingDrill ||
                            requiresRetry ||
                            reflectionModalOpen ||
                            reflectionSubmitting ||
                            skipSubmitting
                        }
                    >
                        <ArrowRight />
                        {isCreatingDrill
                            ? "Building next drill..."
                            : "Start another drill"}
                    </Button>
                ) : null}
            </div>

            {/* Situation — brief scene-setting */}
            <p className="mt-3 text-sm text-muted-foreground">
                {plan.scenario.situationContext}
            </p>

            {/* Question / Prompt — the main thing the learner responds to */}
            {question ? (
                <div className="mt-3 rounded-lg border-2 border-foreground/20 bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Your prompt
                    </p>
                    <p className="mt-2 text-lg font-semibold leading-relaxed">
                        {question}
                    </p>
                </div>
            ) : null}

            {/* Reference details — collapsible so they don't block the prompt */}
            {plan.scenario.givenContent ? (
                <details className="mt-3 rounded-lg border border-border/60 bg-background/50">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                        Reference details
                    </summary>
                    <div className="px-3 pb-3">
                        <MarkdownBlock markdown={plan.scenario.givenContent} />
                    </div>
                </details>
            ) : null}

            <details className="mt-3 rounded-lg border border-border/60 bg-background/50">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                    Framework
                </summary>
                <div className="px-3 pb-3">
                    <MarkdownBlock markdown={plan.scenario.framework} />
                </div>
            </details>
            <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                    Skill target
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {plan.skillTarget}
                </p>
            </div>
        </div>
    );
}
