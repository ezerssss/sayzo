"use client";

import ky from "ky";
import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InstallPanel } from "@/components/install/install-panel";
import {
    OnboardingDrillStep,
    type OnboardingDrillResult,
} from "@/components/onboarding/setup-wizard/onboarding-drill-step";
import {
    ONBOARDING_DRILLS,
    SETUP_WIZARD_STEP_ORDER,
    type SetupWizardStep,
} from "@/components/onboarding/setup-wizard/steps";
import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { track } from "@/lib/analytics/client";
import { db } from "@/lib/firebase/client";
import {
    getKyErrorMessage,
    isKyTimeoutLikeError,
} from "@/lib/ky-error-message";
import type {
    OnboardingDrillProgress,
    UserProfileType,
} from "@/types/user";

interface PropsInterface {
    uid: string;
    onBack?: () => void;
    /** Previously saved drill transcripts from Firestore, used to resume. */
    savedDrills?: OnboardingDrillProgress[];
}

/**
 * Compute the initial wizard step based on which drills are already saved.
 */
function computeResumeStep(
    saved: OnboardingDrillProgress[] | undefined,
): SetupWizardStep {
    const completedTypes = new Set(saved?.map((d) => d.drillType) ?? []);
    for (const drill of ONBOARDING_DRILLS) {
        if (!completedTypes.has(drill.drillType)) {
            return drill.step;
        }
    }
    // All drills complete — land on the last one; finish is one click away.
    const last = ONBOARDING_DRILLS[ONBOARDING_DRILLS.length - 1];
    return last!.step;
}

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { uid, onBack, savedDrills } = props;
    const [step, setStep] = useState<SetupWizardStep>(() =>
        computeResumeStep(savedDrills),
    );
    const drillResults = useRef<Map<string, OnboardingDrillResult>>(new Map());
    const savedTranscripts = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        if (savedDrills) {
            for (const d of savedDrills) {
                savedTranscripts.current.set(d.drillType, d.transcript);
            }
        }
    }, [savedDrills]);

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

    const getTranscript = useCallback((drillType: string): string => {
        const result = drillResults.current.get(drillType);
        if (result) return result.transcript.trim();
        return savedTranscripts.current.get(drillType)?.trim() ?? "";
    }, []);

    const saveDrillToServer = useCallback(
        async (drillType: string, transcript: string) => {
            try {
                await ky.post("/api/onboarding/save-drill", {
                    json: { uid, drillType, transcript },
                    timeout: 15_000,
                });
            } catch {
                console.warn(`Failed to persist drill ${drillType}`);
            }
        },
        [uid],
    );

    const finish = useCallback(async () => {
        setCreateProfileError(null);
        setLoadingStageIndex(0);
        setIsCreatingProfile(true);

        try {
            const fd = new FormData();

            const drills = ONBOARDING_DRILLS.map((drill) => ({
                drillType: drill.drillType,
                transcript: getTranscript(drill.drillType),
            }));

            fd.append("payload", JSON.stringify({ uid, drills }));

            for (const drill of ONBOARDING_DRILLS) {
                const result = drillResults.current.get(drill.drillType);
                if (!result) continue;
                fd.append(
                    `audio_${drill.drillType}`,
                    new File([result.audio.slice()], result.filename, {
                        type: result.mimeType,
                    }),
                );
            }

            await ky.post("/api/onboarding/complete", {
                body: fd,
                timeout: 330_000,
            });
            if (!onboardingCompletedFiredRef.current) {
                onboardingCompletedFiredRef.current = true;
                const drillCount = drills.filter((d) =>
                    d.transcript.trim(),
                ).length;
                const startedAt = onboardingStartedAtRef.current;
                const totalDurationSec =
                    startedAt === null
                        ? null
                        : Math.round((Date.now() - startedAt) / 1000);
                track("onboarding_completed", {
                    drill_count: drillCount,
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
    }, [uid, getTranscript]);

    const handleDrillComplete = useCallback(
        (
            drillType: string,
            result: OnboardingDrillResult,
            isLastDrill: boolean,
        ) => {
            drillResults.current.set(drillType, result);
            savedTranscripts.current.set(drillType, result.transcript);
            void saveDrillToServer(drillType, result.transcript);

            const drillIndex = ONBOARDING_DRILLS.findIndex(
                (d) => d.drillType === drillType,
            );
            track("onboarding_drill_submitted", {
                drill_index: drillIndex >= 0 ? drillIndex + 1 : 0,
            });

            if (isLastDrill) {
                void finish();
            } else {
                goNext();
            }
        },
        [goNext, finish, saveDrillToServer],
    );

    const handleDrillSkip = useCallback(
        (isLastDrill: boolean) => {
            if (isLastDrill) {
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
                        headline="While you wait — install the desktop companion"
                        subhead="It runs locally and picks up the moments worth coaching on, so your drills stay tuned to real life, not imagined scenarios."
                    />
                </div>
            </section>
        );
    }

    return (
        <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-10 sm:px-8">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
                    <Sparkles className="size-4 shrink-0" />
                    <span>
                        Step {Math.max(1, stepIndex + 1)} of {totalSteps}
                    </span>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
                    {ONBOARDING_DRILLS.map((drill, i) =>
                        step === drill.step ? (
                            <OnboardingDrillStep
                                key={drill.step}
                                drill={drill}
                                drillIndex={i}
                                onBack={goPrev}
                                isLast={i === ONBOARDING_DRILLS.length - 1}
                                onNext={(result) =>
                                    handleDrillComplete(
                                        drill.drillType,
                                        result,
                                        i === ONBOARDING_DRILLS.length - 1,
                                    )
                                }
                                onSkip={() =>
                                    handleDrillSkip(
                                        i === ONBOARDING_DRILLS.length - 1,
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
