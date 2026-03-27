"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { VoiceInputBlock } from "@/components/onboarding/voice-input-block";
import { Button } from "@/components/ui/button";

interface PropsInterface {
    roleContext: string;
    onRoleContextChange: (value: string) => void;
    canContinue: boolean;
    onBack: () => void;
    onNext: () => void;
}

export function RoleStep(props: Readonly<PropsInterface>) {
    const {
        roleContext,
        onRoleContextChange,
        canContinue,
        onBack,
        onNext,
    } = props;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    What is your role?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Share your current role, or the role you are preparing for.
                </p>
            </div>
            <VoiceInputBlock
                label="What role best describes you?"
                value={roleContext}
                onChange={onRoleContextChange}
                placeholder="e.g. Product manager leading roadmap planning, or candidate preparing for customer success interviews."
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
