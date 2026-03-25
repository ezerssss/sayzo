"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { SelectableChips } from "@/components/onboarding/selectable-chips";
import { VoiceInputBlock } from "@/components/onboarding/voice-input-block";
import { Button } from "@/components/ui/button";

const GOAL_CHIP_OPTIONS = [
    "Presentations",
    "Meetings",
    "Interviews",
    "Client calls",
    "Demos",
    "Public speaking",
    "Small talk & networking",
] as const;

interface PropsInterface {
    goals: string[];
    onGoalsChange: (next: string[]) => void;
    goalsFreeText: string;
    onGoalsFreeTextChange: (value: string) => void;
    canContinue: boolean;
    onBack: () => void;
    onNext: () => void;
}

export function GoalsStep(props: Readonly<PropsInterface>) {
    const {
        goals,
        onGoalsChange,
        goalsFreeText,
        onGoalsFreeTextChange,
        canContinue,
        onBack,
        onNext,
    } = props;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    What do you want to get better at?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Tap any that apply, add your own in text or voice, or both.
                </p>
            </div>
            <SelectableChips
                options={GOAL_CHIP_OPTIONS}
                selected={goals}
                onChange={onGoalsChange}
            />
            <VoiceInputBlock
                label="Anything else to add?"
                value={goalsFreeText}
                onChange={onGoalsFreeTextChange}
                placeholder="Optional: specifics, scenarios, or targets."
                minRows={3}
            />
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={onBack}
                >
                    <ArrowLeft />
                    Back
                </Button>
                <Button
                    type="button"
                    className="flex-1"
                    disabled={!canContinue}
                    onClick={onNext}
                >
                    Continue
                    <ArrowRight />
                </Button>
            </div>
        </div>
    );
}
