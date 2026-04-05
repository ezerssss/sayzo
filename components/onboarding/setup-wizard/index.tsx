"use client";

import ky from "ky";
import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
    OnboardingDrillStep,
    type OnboardingDrillResult,
} from "@/components/onboarding/setup-wizard/onboarding-drill-step";
import { ReviewStep } from "@/components/onboarding/setup-wizard/review-step";
import {
    ONBOARDING_DRILLS,
    SETUP_WIZARD_STEP_ORDER,
    type SetupWizardStep,
} from "@/components/onboarding/setup-wizard/steps";
import { WelcomeStep } from "@/components/onboarding/setup-wizard/welcome-step";
import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { db } from "@/lib/firebase/client";
import {
    getKyErrorMessage,
    isKyTimeoutLikeError,
} from "@/lib/ky-error-message";
import type { UserProfileFieldsFromAI } from "@/services/profile-context-builder";
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
 * If all 3 drills are done → review. If some → the next incomplete drill.
 * If none → welcome (or drill-intro if they've at least started).
 */
function computeResumeStep(
    saved: OnboardingDrillProgress[] | undefined,
): SetupWizardStep {
    if (!saved || saved.length === 0) return "welcome";

    const completedTypes = new Set(saved.map((d) => d.drillType));
    for (const drill of ONBOARDING_DRILLS) {
        if (!completedTypes.has(drill.drillType)) {
            return drill.step;
        }
    }
    // All drills completed → go to review
    return "review";
}

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { uid, onBack, savedDrills } = props;
    const [step, setStep] = useState<SetupWizardStep>(() =>
        computeResumeStep(savedDrills),
    );
    const drillResults = useRef<Map<string, OnboardingDrillResult>>(new Map());
    const savedTranscripts = useRef<Map<string, string>>(new Map());

    // Populate saved transcripts on mount for use in profile extraction
    useEffect(() => {
        if (savedDrills) {
            for (const d of savedDrills) {
                savedTranscripts.current.set(d.drillType, d.transcript);
            }
        }
    }, [savedDrills]);

    // Review step state
    const [extractedProfile, setExtractedProfile] =
        useState<UserProfileFieldsFromAI | null>(null);
    const [extractLoading, setExtractLoading] = useState(false);
    const [extractError, setExtractError] = useState<string | null>(null);

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

    /** Get the transcript for a drill — from current session results or saved progress. */
    const getTranscript = useCallback(
        (drillType: string): string => {
            const result = drillResults.current.get(drillType);
            if (result) return result.transcript.trim();
            return savedTranscripts.current.get(drillType)?.trim() ?? "";
        },
        [],
    );

    const extractProfile = useCallback(async () => {
        setExtractLoading(true);
        setExtractError(null);
        setExtractedProfile(null);

        const drills = ONBOARDING_DRILLS.map((drill) => ({
            drillType: drill.drillType,
            transcript: getTranscript(drill.drillType),
        }));

        try {
            const fields = await ky
                .post("/api/onboarding/extract-profile", {
                    json: { drills },
                    timeout: 60_000,
                })
                .json<UserProfileFieldsFromAI>();
            setExtractedProfile(fields);
        } catch (e) {
            setExtractError(
                await getKyErrorMessage(
                    e,
                    "Could not extract your profile. You can try again or go back.",
                ),
            );
        } finally {
            setExtractLoading(false);
        }
    }, [getTranscript]);

    const saveDrillToServer = useCallback(
        async (drillType: string, transcript: string) => {
            try {
                await ky.post("/api/onboarding/save-drill", {
                    json: { uid, drillType, transcript },
                    timeout: 15_000,
                });
            } catch {
                // Non-critical — drill is still in memory for this session
                console.warn(`Failed to persist drill ${drillType}`);
            }
        },
        [uid],
    );

    const finish = useCallback(
        async (profileOverrides: UserProfileFieldsFromAI) => {
            // Need transcripts for all drills (from results or saved)
            const hasAll = ONBOARDING_DRILLS.every(
                (d) => getTranscript(d.drillType).length > 0,
            );
            if (!hasAll) return;

            setCreateProfileError(null);
            setLoadingStageIndex(0);
            setIsCreatingProfile(true);

            try {
                const fd = new FormData();

                const drills = ONBOARDING_DRILLS.map((drill) => ({
                    drillType: drill.drillType,
                    transcript: getTranscript(drill.drillType),
                }));

                fd.append(
                    "payload",
                    JSON.stringify({
                        uid,
                        drills,
                        profileOverrides,
                    }),
                );

                // Attach audio files for drills completed in this session
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
        },
        [uid, getTranscript],
    );

    const handleDrillComplete = useCallback(
        (
            drillType: string,
            result: OnboardingDrillResult,
            isLastDrill: boolean,
        ) => {
            drillResults.current.set(drillType, result);
            savedTranscripts.current.set(drillType, result.transcript);

            // Persist to Firestore so user can resume later
            void saveDrillToServer(drillType, result.transcript);

            if (isLastDrill) {
                goNext();
                void extractProfile();
            } else {
                goNext();
            }
        },
        [goNext, extractProfile, saveDrillToServer],
    );

    const totalSteps = SETUP_WIZARD_STEP_ORDER.length;
    const shouldShowProcessing =
        isCreatingProfile || onboardingStatus === "processing";

    // If we resumed directly to review, kick off extraction
    useEffect(() => {
        if (step === "review" && !extractedProfile && !extractLoading) {
            void extractProfile();
        }
        // Only run on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

            {ONBOARDING_DRILLS.map((drill, i) =>
                step === drill.step ? (
                    <OnboardingDrillStep
                        key={drill.step}
                        drill={drill}
                        drillIndex={i}
                        totalDrills={ONBOARDING_DRILLS.length}
                        onBack={goPrev}
                        isLast={i === ONBOARDING_DRILLS.length - 1}
                        onNext={(result) =>
                            handleDrillComplete(
                                drill.drillType,
                                result,
                                i === ONBOARDING_DRILLS.length - 1,
                            )
                        }
                    />
                ) : null,
            )}

            {step === "review" ? (
                <ReviewStep
                    profile={extractedProfile}
                    loading={extractLoading}
                    error={extractError}
                    onBack={goPrev}
                    onFinish={(edited) => void finish(edited)}
                    onRetry={() => void extractProfile()}
                />
            ) : null}

            {createProfileError && step !== "review" ? (
                <p
                    className="mt-3 text-center text-sm text-destructive"
                    role="alert"
                >
                    {createProfileError}
                </p>
            ) : null}
        </section>
    );
}
