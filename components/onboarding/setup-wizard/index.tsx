"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InstallPanel } from "@/components/install/install-panel";
import { MobileBanner } from "@/components/mobile/mobile-banner";
import {
    OnboardingSampleStep,
    type OnboardingSampleResult,
} from "@/components/onboarding/setup-wizard/onboarding-sample-step";
import {
    ONBOARDING_SAMPLES,
    SETUP_WIZARD_STEP_ORDER,
    type SetupWizardStep,
} from "@/components/onboarding/setup-wizard/steps";
import { FirestoreCollections } from "@/schemas";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api-client";
import { db } from "@/lib/firebase/client";
import {
    getKyErrorMessage,
    isKyTimeoutLikeError,
} from "@/lib/ky-error-message";
import type { OnboardingSampleProgress, UserProfileType } from "@/schemas";

interface PropsInterface {
    uid: string;
    onBack?: () => void;
    /** Previously saved voice-sample transcripts from Firestore, used to resume. */
    savedSamples?: OnboardingSampleProgress[];
}

/**
 * Compute the initial wizard step based on which samples are already saved.
 */
function computeResumeStep(
    saved: OnboardingSampleProgress[] | undefined,
): SetupWizardStep {
    const completedTypes = new Set(saved?.map((s) => s.sampleType) ?? []);
    for (const sample of ONBOARDING_SAMPLES) {
        if (!completedTypes.has(sample.sampleType)) {
            return sample.step;
        }
    }
    // All samples complete — land on the last one; finish is one click away.
    const last = ONBOARDING_SAMPLES[ONBOARDING_SAMPLES.length - 1];
    return last!.step;
}

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { uid, onBack, savedSamples } = props;
    const [step, setStep] = useState<SetupWizardStep>(() =>
        computeResumeStep(savedSamples),
    );
    const sampleResults = useRef<Map<string, OnboardingSampleResult>>(
        new Map(),
    );
    const savedTranscripts = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        if (savedSamples) {
            for (const s of savedSamples) {
                savedTranscripts.current.set(s.sampleType, s.transcript);
            }
        }
    }, [savedSamples]);

    const onboardingStartFiredRef = useRef(false);
    const onboardingStartedAtRef = useRef<number | null>(null);
    const onboardingCompletedFiredRef = useRef(false);
    useEffect(() => {
        if (onboardingStartFiredRef.current) return;
        onboardingStartFiredRef.current = true;
        onboardingStartedAtRef.current = Date.now();
        track("onboarding_started", {});
    }, []);

    // Submission state
    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [createProfileError, setCreateProfileError] = useState<string | null>(
        null,
    );
    const loadingStages = [
        "Processing your speaking samples",
        "Building your professional profile",
        "Analyzing communication baseline",
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
            if (next) setStep(next);
        }
    }, [step]);

    const goPrev = useCallback(() => {
        const i = SETUP_WIZARD_STEP_ORDER.indexOf(step);
        if (i > 0) {
            const prev = SETUP_WIZARD_STEP_ORDER[i - 1];
            if (prev) setStep(prev);
        } else if (i === 0 && onBack) {
            onBack();
        }
    }, [step, onBack]);

    const getTranscript = useCallback((sampleType: string): string => {
        const result = sampleResults.current.get(sampleType);
        if (result) return result.transcript.trim();
        return savedTranscripts.current.get(sampleType)?.trim() ?? "";
    }, []);

    const saveSampleToServer = useCallback(
        async (sampleType: string, transcript: string) => {
            try {
                await api.post("/api/onboarding/save-sample", {
                    json: { sampleType, transcript },
                    timeout: 15_000,
                });
            } catch {
                console.warn(`Failed to persist sample ${sampleType}`);
            }
        },
        [],
    );

    const finish = useCallback(async () => {
        setCreateProfileError(null);
        setLoadingStageIndex(0);
        setIsCreatingProfile(true);

        try {
            const fd = new FormData();

            // The /complete route + profile builder still speak the internal
            // "drills" wire shape; map our sampleType onto it at the boundary.
            const drills = ONBOARDING_SAMPLES.map((sample) => ({
                drillType: sample.sampleType,
                transcript: getTranscript(sample.sampleType),
            }));

            fd.append("payload", JSON.stringify({ drills }));

            for (const sample of ONBOARDING_SAMPLES) {
                const result = sampleResults.current.get(sample.sampleType);
                if (!result) continue;
                fd.append(
                    `audio_${sample.sampleType}`,
                    new File([result.audio.slice()], result.filename, {
                        type: result.mimeType,
                    }),
                );
            }

            await api.post("/api/onboarding/complete", {
                body: fd,
                timeout: 330_000,
            });
            if (!onboardingCompletedFiredRef.current) {
                onboardingCompletedFiredRef.current = true;
                const sampleCount = drills.filter((d) =>
                    d.transcript.trim(),
                ).length;
                const startedAt = onboardingStartedAtRef.current;
                const totalDurationSec =
                    startedAt === null
                        ? null
                        : Math.round((Date.now() - startedAt) / 1000);
                track("onboarding_completed", {
                    drill_count: sampleCount,
                    total_duration_sec: totalDurationSec,
                });
            }
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
    }, [getTranscript]);

    const handleSampleComplete = useCallback(
        (
            sampleType: string,
            result: OnboardingSampleResult,
            isLastSample: boolean,
        ) => {
            sampleResults.current.set(sampleType, result);
            savedTranscripts.current.set(sampleType, result.transcript);
            void saveSampleToServer(sampleType, result.transcript);

            const sampleIndex = ONBOARDING_SAMPLES.findIndex(
                (s) => s.sampleType === sampleType,
            );
            track("onboarding_drill_submitted", {
                drill_index: sampleIndex >= 0 ? sampleIndex + 1 : 0,
            });

            if (isLastSample) {
                void finish();
            } else {
                goNext();
            }
        },
        [goNext, finish, saveSampleToServer],
    );

    const handleSampleSkip = useCallback(
        (isLastSample: boolean) => {
            if (isLastSample) {
                void finish();
            } else {
                goNext();
            }
        },
        [goNext, finish],
    );

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
            () => {},
        );
        return unsubscribe;
    }, [uid]);

    if (shouldShowProcessing) {
        return (
            <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
                <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10 sm:px-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="size-4 shrink-0 text-foreground/70" />
                        <span>Finalizing</span>
                    </div>
                    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <Loader2 className="size-5 animate-spin text-primary" />
                            <h2 className="text-base font-semibold tracking-tight">
                                Building your personalized plan
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

                    <InstallPanel
                        headline="Last step: install Sayzo to start"
                        subhead="Sayzo runs on your computer and joins your work calls. After each one, you get feedback and can replay the moments worth practicing."
                        analyticsSource="onboarding"
                    />
                </div>
            </section>
        );
    }

    return (
        <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
            <MobileBanner page="app" />
            <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10 sm:px-8">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
                    <Sparkles className="size-4 shrink-0" />
                    <span>
                        Step {Math.max(1, stepIndex + 1)} of {totalSteps}
                    </span>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
                    {ONBOARDING_SAMPLES.map((sample, i) =>
                        step === sample.step ? (
                            <OnboardingSampleStep
                                key={sample.step}
                                sample={sample}
                                sampleIndex={i}
                                onBack={goPrev}
                                isLast={i === ONBOARDING_SAMPLES.length - 1}
                                onNext={(result) =>
                                    handleSampleComplete(
                                        sample.sampleType,
                                        result,
                                        i === ONBOARDING_SAMPLES.length - 1,
                                    )
                                }
                                onSkip={() =>
                                    handleSampleSkip(
                                        i === ONBOARDING_SAMPLES.length - 1,
                                    )
                                }
                            />
                        ) : null,
                    )}
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
