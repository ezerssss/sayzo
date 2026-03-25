"use client";

import ky from "ky";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { GoalsStep } from "@/components/onboarding/setup-wizard/goals-step";
import { PainStep } from "@/components/onboarding/setup-wizard/pain-step";
import { RoleStep } from "@/components/onboarding/setup-wizard/role-step";
import {
    SETUP_WIZARD_STEP_ORDER,
    type SetupWizardStep,
} from "@/components/onboarding/setup-wizard/steps";
import {
    type IntroSamplePayload,
    SampleStep,
} from "@/components/onboarding/setup-wizard/sample-step";
import { WelcomeStep } from "@/components/onboarding/setup-wizard/welcome-step";

interface PropsInterface {
    uid: string;
    onBack?: () => void;
}

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { uid, onBack } = props;
    const [step, setStep] = useState<SetupWizardStep>("welcome");
    const [roleContext, setRoleContext] = useState("");
    const [goals, setGoals] = useState<string[]>([]);
    const [goalsFreeText, setGoalsFreeText] = useState("");
    const [painPoints, setPainPoints] = useState<string[]>([]);
    const [painFreeText, setPainFreeText] = useState("");
    const [introSample, setIntroSample] = useState<IntroSamplePayload | null>(
        null,
    );
    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [createProfileError, setCreateProfileError] = useState<string | null>(
        null,
    );

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

    const finish = useCallback(async () => {
        if (!introSample) {
            return;
        }
        setCreateProfileError(null);
        setIsCreatingProfile(true);

        const payload = {
            uid,
            roleContext: roleContext.trim(),
            goals,
            goalsFreeText: goalsFreeText.trim(),
            painPoints,
            painFreeText: painFreeText.trim(),
            introTranscript: introSample.transcript.trim(),
        };

        try {
            const fd = new FormData();
            fd.append("payload", JSON.stringify(payload));
            fd.append(
                "audio",
                new File([introSample.audio.slice()], introSample.filename, {
                    type: introSample.mimeType,
                }),
            );
            await ky.post("/api/onboarding/complete", {
                body: fd,
                timeout: 300_000,
            });
        } catch (error) {
            setCreateProfileError(
                error instanceof Error
                    ? error.message
                    : "Could not create your profile right now.",
            );
            setIsCreatingProfile(false);
        }
    }, [
        goals,
        goalsFreeText,
        introSample,
        painFreeText,
        painPoints,
        roleContext,
        uid,
    ]);

    const canContinueRole = roleContext.trim().length > 0;
    const canContinueGoals =
        goals.length > 0 || goalsFreeText.trim().length > 0;
    const canContinuePain =
        painPoints.length > 0 || painFreeText.trim().length > 0;
    const canFinishSample =
        introSample !== null && introSample.transcript.trim().length > 0;

    if (isCreatingProfile) {
        return (
            <section className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <div className="space-y-6 py-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="size-4 shrink-0 text-foreground/70" />
                        <span>Step 5 of 5</span>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
                        <Loader2 className="size-7 animate-spin text-primary" />
                        <div className="space-y-2">
                            <h2 className="text-lg font-semibold tracking-tight">
                                Creating your profile...
                            </h2>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                We are analyzing your intro and preparing your
                                personalized Eloquy profile.
                            </p>
                        </div>
                    </div>
                    {createProfileError ? (
                        <p
                            className="text-center text-sm text-destructive"
                            role="alert"
                        >
                            {createProfileError}
                        </p>
                    ) : null}
                </div>
            </section>
        );
    }

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
                    onIntroReady={setIntroSample}
                    onIntroClear={() => setIntroSample(null)}
                />
            ) : null}

            {createProfileError ? (
                <p className="mt-3 text-center text-sm text-destructive" role="alert">
                    {createProfileError}
                </p>
            ) : null}
        </section>
    );
}
