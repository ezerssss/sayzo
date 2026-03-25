"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { SelectableChips } from "@/components/onboarding/selectable-chips";
import { VoiceInputBlock } from "@/components/onboarding/voice-input-block";
import { Button } from "@/components/ui/button";

const PAIN_POINT_CHIP_OPTIONS = [
    "Nervousness",
    "Finding the right words",
    "Pace & clarity",
    "Accent confidence",
    "Grammar under pressure",
    "Speaking up in fast meetings",
] as const;

interface PropsInterface {
    painPoints: string[];
    onPainPointsChange: (next: string[]) => void;
    painFreeText: string;
    onPainFreeTextChange: (value: string) => void;
    canContinue: boolean;
    onBack: () => void;
    onNext: () => void;
}

export function PainStep(props: Readonly<PropsInterface>) {
    const {
        painPoints,
        onPainPointsChange,
        painFreeText,
        onPainFreeTextChange,
        canContinue,
        onBack,
        onNext,
    } = props;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    What feels hardest in English?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Pick what applies. Add detail below if you want.
                </p>
            </div>
            <SelectableChips
                options={PAIN_POINT_CHIP_OPTIONS}
                selected={painPoints}
                onChange={onPainPointsChange}
            />
            <VoiceInputBlock
                label="Say more if you like"
                value={painFreeText}
                onChange={onPainFreeTextChange}
                placeholder="Optional: examples, triggers, or past situations."
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
