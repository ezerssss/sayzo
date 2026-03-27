"use client";

import ky from "ky";
import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GoalsStep } from "@/components/onboarding/setup-wizard/goals-step";
import { EmploymentStep } from "@/components/onboarding/setup-wizard/employment-step";
import { MotivationStep } from "@/components/onboarding/setup-wizard/motivation-step";
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
import { WorkplaceStep } from "@/components/onboarding/setup-wizard/workplace-step";
import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import { getKyErrorMessage, isKyTimeoutLikeError } from "@/lib/ky-error-message";
import type { UserProfileType } from "@/types/user";

interface PropsInterface {
    uid: string;
    onBack?: () => void;
}

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { uid, onBack } = props;
    const [step, setStep] = useState<SetupWizardStep>("welcome");
    const [roleContext, setRoleContext] = useState("");
    const [employmentStatus, setEmploymentStatus] = useState<
        "employed" | "unemployed"
    >("employed");
    const [wantsInterviewPractice, setWantsInterviewPractice] = useState(false);
    const [companyName, setCompanyName] = useState("");
    const [companyUrl, setCompanyUrl] = useState("");
    const [companyContext, setCompanyContext] = useState("");
    const [workRoleContext, setWorkRoleContext] = useState("");
    const [goals, setGoals] = useState<string[]>([]);
    const [goalsFreeText, setGoalsFreeText] = useState("");
    const [motivation, setMotivation] = useState("");
    const [painPoints, setPainPoints] = useState<string[]>([]);
    const [painFreeText, setPainFreeText] = useState("");
    const [introSample, setIntroSample] = useState<IntroSamplePayload | null>(
        null,
    );
    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [createProfileError, setCreateProfileError] = useState<string | null>(
        null,
    );
    const loadingStages = [
        "Processing your intro sample",
        "Building your professional profile",
        "Analyzing communication baseline",
        "Generating your first personalized drill",
    ] as const;
    const [loadingStageIndex, setLoadingStageIndex] = useState(0);
    const [onboardingStatus, setOnboardingStatus] = useState<
        UserProfileType["onboardingStatus"] | null
    >(null);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);

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
        setLoadingStageIndex(0);
        setIsCreatingProfile(true);

        const payload = {
            uid,
            roleContext: roleContext.trim(),
            employmentStatus,
            wantsInterviewPractice:
                employmentStatus === "unemployed" ? true : wantsInterviewPractice,
            companyName: companyName.trim(),
            companyUrl: companyUrl.trim(),
            companyContext: companyContext.trim(),
            workRoleContext: workRoleContext.trim(),
            goals,
            goalsFreeText: goalsFreeText.trim(),
            motivation: motivation.trim(),
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
                timeout: 330_000,
            });
        } catch (error) {
            if (isKyTimeoutLikeError(error)) {
                setCreateProfileError(
                    "Still processing in the background. Keep this page open.",
                );
                return;
            }
            setCreateProfileError(
                await getKyErrorMessage(
                    error,
                    "Could not create your profile right now.",
                ),
            );
            setIsCreatingProfile(false);
        }
    }, [
        goals,
        goalsFreeText,
        introSample,
        companyContext,
        companyName,
        companyUrl,
        motivation,
        painFreeText,
        painPoints,
        roleContext,
        employmentStatus,
        wantsInterviewPractice,
        workRoleContext,
        uid,
    ]);

    const canContinueRole = roleContext.trim().length > 0;
    const canContinueWorkplace =
        (employmentStatus === "employed"
            ? companyName.trim().length > 0 &&
              companyContext.trim().length > 0 &&
              workRoleContext.trim().length > 0
            : workRoleContext.trim().length > 0);
    const canContinueGoals =
        goals.length > 0 || goalsFreeText.trim().length > 0;
    const canContinueMotivation = motivation.trim().length > 0;
    const canContinuePain =
        painPoints.length > 0 || painFreeText.trim().length > 0;
    const canFinishSample =
        introSample !== null && introSample.transcript.trim().length > 0;
    const totalSteps = SETUP_WIZARD_STEP_ORDER.length;
    const shouldShowProcessing =
        isCreatingProfile || onboardingStatus === "processing";

    useEffect(() => {
        if (!isCreatingProfile) return;
        const id = setInterval(() => {
            setLoadingStageIndex((prev) =>
                prev < loadingStages.length - 1 ? prev + 1 : prev,
            );
        }, 1600);
        return () => clearInterval(id);
    }, [isCreatingProfile, loadingStages.length]);

    useEffect(() => {
        const ref = doc(db, FirestoreCollections.users.path, uid);
        const unsubscribe = onSnapshot(
            ref,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setOnboardingStatus(null);
                    setOnboardingError(null);
                    return;
                }
                const data = snapshot.data() as Partial<UserProfileType>;
                setOnboardingStatus(data.onboardingStatus ?? null);
                setOnboardingError(
                    typeof data.onboardingError === "string"
                        ? data.onboardingError
                        : null,
                );
                if (data.onboardingStatus === "processing") {
                    setIsCreatingProfile(true);
                }
            },
            () => {
                // Keep current UI state on transient listener errors.
            },
        );
        return unsubscribe;
    }, [uid]);

    if (shouldShowProcessing) {
        return (
            <section className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <div className="space-y-6 py-6">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="size-4 shrink-0 text-foreground/70" />
                        <span>Step {totalSteps} of {totalSteps}</span>
                    </div>
                    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <Loader2 className="size-5 animate-spin text-primary" />
                            <h2 className="text-base font-semibold tracking-tight">
                                Finalizing your setup
                            </h2>
                        </div>
                        <div className="space-y-2">
                            {loadingStages.map((stage, i) => {
                                const done = i < loadingStageIndex;
                                const active = i === loadingStageIndex;
                                let statusIcon;
                                if (done) {
                                    statusIcon = (
                                        <CheckCircle2 className="size-4 text-emerald-600" />
                                    );
                                } else if (active) {
                                    statusIcon = (
                                        <Loader2 className="size-4 animate-spin text-primary" />
                                    );
                                } else {
                                    statusIcon = (
                                        <div className="size-4 rounded-full border border-border" />
                                    );
                                }
                                return (
                                    <div
                                        key={stage}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        {statusIcon}
                                        <span
                                            className={
                                                active
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
                    </div>
                    {createProfileError || onboardingError ? (
                        <p
                            className="text-center text-sm text-destructive"
                            role="alert"
                        >
                            {createProfileError ?? onboardingError}
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
                    <span>
                        Step {Math.max(1, stepIndex + 1)} of {totalSteps}
                    </span>
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

            {step === "workplace" ? (
                <WorkplaceStep
                    employmentStatus={employmentStatus}
                    wantsInterviewPractice={wantsInterviewPractice}
                    onWantsInterviewPracticeChange={setWantsInterviewPractice}
                    companyName={companyName}
                    onCompanyNameChange={setCompanyName}
                    companyUrl={companyUrl}
                    onCompanyUrlChange={setCompanyUrl}
                    companyContext={companyContext}
                    onCompanyContextChange={setCompanyContext}
                    workRoleContext={workRoleContext}
                    onWorkRoleContextChange={setWorkRoleContext}
                    canContinue={canContinueWorkplace}
                    onBack={goPrev}
                    onNext={goNext}
                />
            ) : null}

            {step === "employment" ? (
                <EmploymentStep
                    employmentStatus={employmentStatus}
                    onEmploymentStatusChange={(value) => {
                        setEmploymentStatus(value);
                        if (value === "unemployed") {
                            setWantsInterviewPractice(true);
                        }
                    }}
                    onBack={goPrev}
                    onNext={goNext}
                />
            ) : null}

            {step === "motivation" ? (
                <MotivationStep
                    motivation={motivation}
                    onMotivationChange={setMotivation}
                    canContinue={canContinueMotivation}
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
