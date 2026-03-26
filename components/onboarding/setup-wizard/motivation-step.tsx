"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { VoiceInputBlock } from "@/components/onboarding/voice-input-block";
import { Button } from "@/components/ui/button";

interface PropsInterface {
    motivation: string;
    onMotivationChange: (value: string) => void;
    canContinue: boolean;
    onBack: () => void;
    onNext: () => void;
}

export function MotivationStep(props: Readonly<PropsInterface>) {
    const { motivation, onMotivationChange, canContinue, onBack, onNext } = props;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    Why improve your English now?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    This helps us prioritize scenarios that matter most in your role.
                </p>
            </div>
            <VoiceInputBlock
                label="What outcomes are you aiming for in the next 3-6 months?"
                value={motivation}
                onChange={onMotivationChange}
                placeholder="e.g. Lead project updates clearly, handle client objections, and feel confident in cross-team meetings."
                minRows={4}
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
