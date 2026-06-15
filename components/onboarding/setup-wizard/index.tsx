"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AmbientBackdrop } from "@/components/app/ambient-backdrop";
import { Eyebrow } from "@/components/app/eyebrow";
import { StaggerItem } from "@/components/coaching/briefing";
import { MobileBanner } from "@/components/mobile/mobile-banner";
import {
    LOADING_STAGES,
    OnboardingFinalizing,
} from "@/components/onboarding/setup-wizard/onboarding-finalizing";
import {
    OnboardingSampleStep,
    type OnboardingSampleResult,
} from "@/components/onboarding/setup-wizard/onboarding-sample-step";
import { ONBOARDING_SAMPLES } from "@/components/onboarding/setup-wizard/steps";
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
    /** Previously saved voice-sample transcript from Firestore, used to resume. */
    savedSamples?: OnboardingSampleProgress[];
}

// Onboarding is now a single, optional voice sample.
const SAMPLE = ONBOARDING_SAMPLES[0]!;

export function SetupWizard(props: Readonly<PropsInterface>) {
    const { uid, savedSamples } = props;

    const sampleResult = useRef<OnboardingSampleResult | null>(null);
    const savedTranscript = useRef<string>("");

    useEffect(() => {
        const saved = savedSamples?.find(
            (s) => s.sampleType === SAMPLE.sampleType,
        );
        if (saved) savedTranscript.current = saved.transcript;
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
    const [loadingStageIndex, setLoadingStageIndex] = useState(0);
    const [onboardingStatus, setOnboardingStatus] = useState<
        UserProfileType["onboardingStatus"] | null
    >(null);
    const [onboardingError, setOnboardingError] = useState<string | null>(null);

    const finish = useCallback(async () => {
        setCreateProfileError(null);
        setLoadingStageIndex(0);
        setIsCreatingProfile(true);

        try {
            const transcript = (
                sampleResult.current?.transcript ?? savedTranscript.current
            ).trim();

            // The /complete route + profile builder still speak the internal
            // "drills" wire shape; map our sampleType onto it at the boundary.
            // An empty transcript is a first-class "skip" — the route creates a
            // baseline profile and releases the onboarding gate.
            const fd = new FormData();
            fd.append(
                "payload",
                JSON.stringify({
                    drills: [{ drillType: SAMPLE.sampleType, transcript }],
                }),
            );

            const result = sampleResult.current;
            if (result) {
                fd.append(
                    `audio_${SAMPLE.sampleType}`,
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
                const startedAt = onboardingStartedAtRef.current;
                const totalDurationSec =
                    startedAt === null
                        ? null
                        : Math.round((Date.now() - startedAt) / 1000);
                track("onboarding_completed", {
                    drill_count: transcript ? 1 : 0,
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
                    "Could not finish setting up your account.",
                ),
            );
            setIsCreatingProfile(false);
        }
    }, []);

    const handleComplete = useCallback(
        (result: OnboardingSampleResult) => {
            sampleResult.current = result;
            savedTranscript.current = result.transcript;
            // Persist the transcript (best-effort) before building the profile.
            void api
                .post("/api/onboarding/save-sample", {
                    json: {
                        sampleType: SAMPLE.sampleType,
                        transcript: result.transcript,
                    },
                    timeout: 15_000,
                })
                .catch(() => {
                    console.warn("Failed to persist onboarding sample");
                });
            track("onboarding_drill_submitted", { drill_index: 1 });
            void finish();
        },
        [finish],
    );

    const handleSkip = useCallback(() => {
        track("onboarding_skipped", {});
        void finish();
    }, [finish]);

    const shouldShowProcessing =
        isCreatingProfile || onboardingStatus === "processing";

    useEffect(() => {
        if (!isCreatingProfile) return;
        const id = setInterval(() => {
            setLoadingStageIndex((prev) =>
                prev < LOADING_STAGES.length - 1 ? prev + 1 : prev,
            );
        }, 1600);
        return () => clearInterval(id);
    }, [isCreatingProfile]);

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
            <OnboardingFinalizing
                stageIndex={loadingStageIndex}
                error={createProfileError ?? onboardingError}
            />
        );
    }

    return (
        <section className="fixed inset-0 overflow-y-auto bg-background">
            <AmbientBackdrop />
            <MobileBanner page="app" />
            <div className="relative flex min-h-full items-center justify-center p-6">
                <div className="w-full max-w-lg">
                    <StaggerItem
                        order={0}
                        className="flex items-center justify-center gap-2"
                    >
                        <Eyebrow tone="sky" className="flex items-center gap-2">
                            <Sparkles className="size-4 shrink-0" />
                            <span>Quick setup</span>
                        </Eyebrow>
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                            Optional
                        </span>
                    </StaggerItem>

                    <StaggerItem order={1} className="mt-8">
                        <OnboardingSampleStep
                            sample={SAMPLE}
                            onNext={handleComplete}
                            onSkip={handleSkip}
                        />
                    </StaggerItem>

                    {createProfileError ? (
                        <p
                            className="mt-4 text-center text-sm text-destructive"
                            role="alert"
                        >
                            {createProfileError}
                        </p>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
