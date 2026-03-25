"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GoalsStep } from "@/components/onboarding/setup-wizard/goals-step";
import { PainStep } from "@/components/onboarding/setup-wizard/pain-step";
import { RoleStep } from "@/components/onboarding/setup-wizard/role-step";
import { SampleStep } from "@/components/onboarding/setup-wizard/sample-step";
import {
    SETUP_WIZARD_STEP_ORDER,
    type SetupWizardStep,
} from "@/components/onboarding/setup-wizard/steps";
import { WelcomeStep } from "@/components/onboarding/setup-wizard/welcome-step";
import type { UserOnboardingProfileType } from "@/types/user";

interface PropsInterface {
    onComplete: (profile: UserOnboardingProfileType) => void;
    onBack?: () => void;
}

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { onComplete, onBack } = props;
    const [step, setStep] = useState<SetupWizardStep>("welcome");
    const [roleContext, setRoleContext] = useState("");
    const [goals, setGoals] = useState<string[]>([]);
    const [goalsFreeText, setGoalsFreeText] = useState("");
    const [painPoints, setPainPoints] = useState<string[]>([]);
    const [painFreeText, setPainFreeText] = useState("");
    const [voiceIntroCaptured, setVoiceIntroCaptured] = useState(false);

    useEffect(() => {
        if (step !== "sample") {
            setVoiceIntroCaptured(false);
        }
    }, [step]);

    const stepIndex = useMemo(
        () => SETUP_WIZARD_STEP_ORDER.indexOf(step),
        [step],
    );

    const goNext = useCallback(() => {
        const i = SETUP_WIZARD_STEP_ORDER.indexOf(step);
        if (i >= 0 && i < SETUP_WIZARD_STEP_ORDER.length - 1) {
            const next = SETUP_WIZARD_STEP_ORDER[i + 1];
            if (next) {
                setStep(next);
            }
        }
    }, [step]);

    const goPrev = useCallback(() => {
        const i = SETUP_WIZARD_STEP_ORDER.indexOf(step);
        if (i > 0) {
            const prev = SETUP_WIZARD_STEP_ORDER[i - 1];
            if (prev) {
                setStep(prev);
            }
        } else if (i === 0 && onBack) {
            onBack();
        }
    }, [step, onBack]);

    const finish = useCallback(() => {
        const profile: UserOnboardingProfileType = {
            onboardingComplete: true,
            roleContext: roleContext.trim(),
            goals,
            goalsFreeText: goalsFreeText.trim(),
            painPoints,
            painPointsFreeText: painFreeText.trim(),
            introSample: "",
        };
        onComplete(profile);
    }, [
        goals,
        goalsFreeText,
        onComplete,
        painFreeText,
        painPoints,
        roleContext,
    ]);

    const canContinueRole = roleContext.trim().length > 0;
    const canContinueGoals =
        goals.length > 0 || goalsFreeText.trim().length > 0;
    const canContinuePain =
        painPoints.length > 0 || painFreeText.trim().length > 0;
    const canFinishSample = voiceIntroCaptured;

    return (
        <section className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="size-4 shrink-0 text-foreground/70" />
                    <span>Step {Math.max(1, stepIndex + 1)} of 5</span>
                </div>
            </div>

            {step === "welcome" ? <WelcomeStep onNext={goNext} /> : null}

            {step === "role" ? (
                <RoleStep
                    roleContext={roleContext}
                    onRoleContextChange={setRoleContext}
                    canContinue={canContinueRole}
                    onBack={goPrev}
                    onNext={goNext}
                />
            ) : null}

            {step === "goals" ? (
                <GoalsStep
                    goals={goals}
                    onGoalsChange={setGoals}
                    goalsFreeText={goalsFreeText}
                    onGoalsFreeTextChange={setGoalsFreeText}
                    canContinue={canContinueGoals}
                    onBack={goPrev}
                    onNext={goNext}
                />
            ) : null}

            {step === "pain" ? (
                <PainStep
                    painPoints={painPoints}
                    onPainPointsChange={setPainPoints}
                    painFreeText={painFreeText}
                    onPainFreeTextChange={setPainFreeText}
                    canContinue={canContinuePain}
                    onBack={goPrev}
                    onNext={goNext}
                />
            ) : null}

            {step === "sample" ? (
                <SampleStep
                    canFinish={canFinishSample}
                    onBack={goPrev}
                    onFinish={finish}
                    onVoiceTakeComplete={() => {
                        setVoiceIntroCaptured(true);
                    }}
                />
            ) : null}
        </section>
    );
}
