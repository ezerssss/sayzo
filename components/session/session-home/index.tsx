"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import ky from "ky";
import { useEffect, useMemo, useRef, useState } from "react";

import { useLatestSession } from "@/hooks/use-latest-session";
import { useSession } from "@/hooks/use-session";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import {
    getKyErrorMessage,
    isKyTimeoutLikeError,
} from "@/lib/ky-error-message";
import { Button } from "@/components/ui/button";
import {
    hasSessionFeedbackContent,
    type SessionFeedbackType,
} from "@/types/sessions";

type SessionView = "drill" | "review";

import { AudioPlayer } from "@/components/session/audio-player";

import {
    DEFAULT_MAX_SECONDS,
    FALLBACK_PLAN,
    HARD_MAX_SECONDS,
    REFLECTION_BEFORE_NEW_DRILL_PROBABILITY,
} from "./constants";
import { DrillBriefCard } from "./drill-brief-card";
import { NewDrillReflectionModal } from "./new-drill-reflection-modal";
import { SessionControlsPanel } from "./session-controls-panel";
import { SessionFeedbackSection } from "./session-feedback-section";
import { SessionHomeHeader } from "./session-home-header";
import { SkipDrillModal } from "./skip-drill-modal";
import type {
    DrillState,
    PreNewDrillReflectionState,
    SessionHomeProps,
} from "./types";

export type { SessionHomeProps } from "./types";

export function SessionHome(props: Readonly<SessionHomeProps>) {
    const { uid, userLabel, onSignOut, authError, sessionId } = props;
    const [drillState, setDrillState] = useState<DrillState>("idle");
    const [seconds, setSeconds] = useState(DEFAULT_MAX_SECONDS);
    const [drillError, setDrillError] = useState<string | null>(null);
    const [isCreatingDrill, setIsCreatingDrill] = useState(false);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(
        null,
    );
    const [hasPendingAnalysisRequest, setHasPendingAnalysisRequest] =
        useState(false);
    const [skipModalOpen, setSkipModalOpen] = useState(false);
    const [reflectionModalOpen, setReflectionModalOpen] = useState(false);
    const [skipFeedbackText, setSkipFeedbackText] = useState("");
    const [reflectionFeedbackText, setReflectionFeedbackText] = useState("");
    const [skipSubmitting, setSkipSubmitting] = useState(false);
    const [reflectionSubmitting, setReflectionSubmitting] = useState(false);
    const [skipTranscribing, setSkipTranscribing] = useState(false);
    const [skipTranscribeError, setSkipTranscribeError] = useState<
        string | null
    >(null);
    const [reflectionTranscribing, setReflectionTranscribing] =
        useState(false);
    const [reflectionTranscribeError, setReflectionTranscribeError] = useState<
        string | null
    >(null);
    const [preNewDrillReflection, setPreNewDrillReflection] =
        useState<PreNewDrillReflectionState | null>(null);
    const [view, setView] = useState<SessionView>("drill");
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const modalRecorder = useVoiceRecorder();
    // Both hooks called unconditionally (rules of hooks).
    // When sessionId is set, useLatestSession gets undefined uid and no-ops.
    // When sessionId is absent, useSession(undefined) no-ops.
    const latestHook = useLatestSession(sessionId ? undefined : uid);
    const specificHook = useSession(sessionId);
    const {
        session,
        loading: loadingSession,
        error: latestSessionError,
    } = sessionId ? specificHook : latestHook;

    const currentPlan = session?.plan ?? FALLBACK_PLAN;
    const maxSeconds = Math.max(
        120,
        Math.min(
            HARD_MAX_SECONDS,
            Math.round(currentPlan.maxDurationSeconds ?? DEFAULT_MAX_SECONDS),
        ),
    );
    const currentTranscript = useMemo(() => {
        return session?.transcript?.trim() ?? "";
    }, [session?.transcript]);

    const currentFeedback = useMemo<SessionFeedbackType | null>(() => {
        return session?.feedback ?? null;
    }, [session?.feedback]);

    const hasFeedback = useMemo(() => {
        if (!currentFeedback) return false;
        return Object.values(currentFeedback).some(
            (value) => typeof value === "string" && value.trim().length > 0,
        );
    }, [currentFeedback]);
    const hasMainOverview = Boolean(currentFeedback?.overview?.trim());
    const coachingSectionKeys = useMemo<Array<keyof SessionFeedbackType>>(() => {
        if (!currentFeedback) return [];
        const keys: Array<keyof SessionFeedbackType> = [
            "momentsToTighten",
            "structureAndFlow",
            "clarityAndConciseness",
            "relevanceAndFocus",
            "engagement",
            "professionalism",
            "deliveryAndProsody",
        ];
        return keys.filter((key) => {
            const value = currentFeedback[key];
            return typeof value === "string" && value.trim().length > 0;
        });
    }, [currentFeedback]);
    const playbackSrc = recordedAudioUrl ?? session?.audioUrl ?? null;
    const isRecordingNow = isRecording || drillState === "recording";
    const isServerProcessing = session?.processingStatus === "processing";
    const requiresRetry =
        session?.completionStatus === "needs_retry" &&
        !isServerProcessing &&
        !isRecordingNow &&
        drillState !== "analyzing";
    const processingStage = session?.processingStage;
    const isSkipped = session?.completionStatus === "skipped";
    const hasServerResults = Boolean(
        session?.completionStatus !== "pending" &&
            (isSkipped ||
                session?.transcript?.trim() ||
                hasFeedback),
    );
    const shouldShowResults = hasServerResults;
    const showRecordAction =
        !isSkipped &&
        (isRecordingNow || !shouldShowResults || requiresRetry);
    const showCompletionActions =
        shouldShowResults &&
        !isSkipped &&
        !isRecordingNow &&
        drillState !== "analyzing" &&
        !requiresRetry;
    const shouldShowAnalyzingState =
        !shouldShowResults &&
        (isServerProcessing ||
            drillState === "analyzing" ||
            hasPendingAnalysisRequest);

    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;

    useEffect(() => {
        setDrillError(latestSessionError);
    }, [latestSessionError]);

    useEffect(() => {
        if (isServerProcessing || shouldShowResults) {
            setDrillError(null);
        }
    }, [isServerProcessing, shouldShowResults]);

    useEffect(() => {
        if (!session) return;
        if (isRecording || drillState === "recording") {
            return;
        }
        if (hasPendingAnalysisRequest && !isServerProcessing && !hasServerResults) {
            setDrillState("analyzing");
            return;
        }
        if (hasServerResults) {
            setDrillState("complete");
            setSeconds(0);
            return;
        }
        if (isServerProcessing) {
            setDrillState("analyzing");
            return;
        }
        setDrillState("idle");
        setSeconds(maxSeconds);
    }, [
        drillState,
        hasServerResults,
        hasPendingAnalysisRequest,
        isRecording,
        isServerProcessing,
        maxSeconds,
        session,
    ]);

    useEffect(() => {
        if (hasServerResults || isServerProcessing) {
            setHasPendingAnalysisRequest(false);
        }
    }, [hasServerResults, isServerProcessing]);

    // Auto-switch to review when results arrive
    useEffect(() => {
        if (shouldShowResults && !isRecordingNow && drillState === "complete") {
            setView("review");
        }
    }, [shouldShowResults, isRecordingNow, drillState]);

    useEffect(() => {
        if (drillState !== "recording") {
            return;
        }
        const id = setInterval(() => {
            setSeconds((s) => {
                if (s <= 1) {
                    setDrillState("analyzing");
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [drillState, isRecording]);

    useEffect(() => {
        return () => {
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
        };
    }, [recordedAudioUrl]);

    const stateLabel = useMemo(() => {
        if (skipSubmitting) {
            return "Skipping this drill…";
        }
        if (isCreatingDrill) {
            return "Creating your next drill…";
        }
        if (isRecording || drillState === "recording") {
            return "Recording your response...";
        }
        if (hasPendingAnalysisRequest) {
            return "Starting analysis...";
        }
        if (isServerProcessing) {
            if (processingStage === "transcribing") {
                return "Transcribing your response...";
            }
            if (processingStage === "uploading") {
                return "Uploading your audio...";
            }
            if (processingStage === "analyzing_expression") {
                return "Analyzing your prosody and tone...";
            }
            if (processingStage === "analyzing") {
                return "Analyzing your transcript...";
            }
            if (processingStage === "combining") {
                return "Combining signals and generating coaching...";
            }
            return "Still processing on the server...";
        }
        if (drillState === "analyzing") {
            return "Syncing latest session status...";
        }
        if (drillState === "complete") {
            if (isSkipped) {
                return "This drill was skipped.";
            }
            return "Session complete. Review your feedback below.";
        }
        return "Ready when you are.";
    }, [
        drillState,
        hasPendingAnalysisRequest,
        isCreatingDrill,
        isRecording,
        isServerProcessing,
        processingStage,
        isSkipped,
        skipSubmitting,
    ]);

    const startRecording = async () => {
        if (session?.completionStatus === "skipped") {
            return;
        }
        setHasPendingAnalysisRequest(false);
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioUrl(null);
        }
        setSeconds(maxSeconds);
        setDrillState("recording");
        await start();
    };

    const stopRecording = async () => {
        if (session?.completionStatus === "skipped") {
            return;
        }
        setHasPendingAnalysisRequest(true);
        const result = await stop();
        if (result?.blob.size) {
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
            setRecordedAudioUrl(URL.createObjectURL(result.blob));
        }
        setSeconds(0);
        setDrillState("analyzing");

        if (!session?.id || !result?.blob.size) {
            setDrillError("No active drill found to save this recording.");
            setHasPendingAnalysisRequest(false);
            setDrillState("idle");
            return;
        }

        try {
            const fd = new FormData();
            fd.append("uid", uid);
            fd.append("sessionId", session.id);
            fd.append(
                "audio",
                new File([result.blob], "response.webm", {
                    type: result.mimeType,
                }),
            );
            await ky.post("/api/sessions/complete", {
                body: fd,
                timeout: 330_000,
            });
            setHasPendingAnalysisRequest(false);
            setDrillState("complete");
        } catch (error) {
            console.error(
                "[components/session/session-home] stopRecording failed",
                error,
            );
            if (isKyTimeoutLikeError(error)) {
                setDrillError(
                    "Still processing in the background. We will update once results are ready.",
                );
                return;
            }
            setDrillError(
                await getKyErrorMessage(
                    error,
                    "Could not analyze your response.",
                ),
            );
            setHasPendingAnalysisRequest(false);
            setDrillState("idle");
        }
    };

    const sessionHasDrillRecordingOnServer = Boolean(
        session?.audioUrl?.trim() ||
            session?.audioObjectPath?.trim() ||
            session?.transcript?.trim(),
    );
    const showSkipDrill =
        session?.completionStatus === "pending" &&
        !isServerProcessing &&
        !requiresRetry &&
        !isRecordingNow &&
        !hasPendingAnalysisRequest &&
        !sessionHasDrillRecordingOnServer &&
        !recordedAudioUrl;

    const toggleSkipVoiceNote = async () => {
        modalRecorder.clearError();
        setSkipTranscribeError(null);
        if (modalRecorder.isRecording) {
            const result = await modalRecorder.stop();
            if (result?.blob.size) {
                setSkipTranscribing(true);
                try {
                    const fd = new FormData();
                    fd.append(
                        "file",
                        new File([result.blob], "skip-note.webm", {
                            type: result.mimeType,
                        }),
                    );
                    const data = await ky
                        .post("/api/transcribe", {
                            body: fd,
                            timeout: 180_000,
                        })
                        .json<{ text?: string }>();
                    const next = data.text?.trim() ?? "";
                    if (next) {
                        setSkipFeedbackText((prev) => {
                            const p = prev.trim();
                            return p ? `${p}\n\n${next}` : next;
                        });
                    } else {
                        setSkipTranscribeError(
                            "We couldn't pick up any words—try again or type below.",
                        );
                    }
                } catch (error) {
                    setSkipTranscribeError(
                        await getKyErrorMessage(
                            error,
                            "Transcription failed.",
                        ),
                    );
                } finally {
                    setSkipTranscribing(false);
                }
            }
            return;
        }
        await modalRecorder.start();
    };

    const toggleReflectionVoiceNote = async () => {
        modalRecorder.clearError();
        setReflectionTranscribeError(null);
        if (modalRecorder.isRecording) {
            const result = await modalRecorder.stop();
            if (result?.blob.size) {
                setReflectionTranscribing(true);
                try {
                    const fd = new FormData();
                    fd.append(
                        "file",
                        new File([result.blob], "reflection-note.webm", {
                            type: result.mimeType,
                        }),
                    );
                    const data = await ky
                        .post("/api/transcribe", {
                            body: fd,
                            timeout: 180_000,
                        })
                        .json<{ text?: string }>();
                    const next = data.text?.trim() ?? "";
                    if (next) {
                        setReflectionFeedbackText((prev) => {
                            const p = prev.trim();
                            return p ? `${p}\n\n${next}` : next;
                        });
                    } else {
                        setReflectionTranscribeError(
                            "We couldn't pick up any words—try again or type below.",
                        );
                    }
                } catch (error) {
                    setReflectionTranscribeError(
                        await getKyErrorMessage(
                            error,
                            "Transcription failed.",
                        ),
                    );
                } finally {
                    setReflectionTranscribing(false);
                }
            }
            return;
        }
        await modalRecorder.start();
    };

    const createNewDrillRequest = async () => {
        setIsCreatingDrill(true);
        setDrillError(null);
        try {
            await ky.post("/api/sessions/new-drill", {
                json: { uid },
                timeout: 330_000,
            });
            setSeconds(maxSeconds);
            setDrillState("idle");
            setView("drill");
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
                setRecordedAudioUrl(null);
            }
        } catch (error) {
            console.error(
                "[components/session/session-home] createNewDrillRequest failed",
                error,
            );
            setDrillError(
                await getKyErrorMessage(error, "Could not create a new drill."),
            );
        } finally {
            setIsCreatingDrill(false);
        }
    };

    const submitSkipDrill = async (opts: { withoutSharing: boolean }) => {
        if (!session?.id) return;
        setSkipSubmitting(true);
        setDrillError(null);
        try {
            if (modalRecorder.isRecording) {
                await modalRecorder.stop();
            }
            const fd = new FormData();
            fd.append("uid", uid);
            fd.append("sessionId", session.id);
            if (opts.withoutSharing) {
                fd.append("skipWithoutFeedback", "1");
            } else {
                const text = skipFeedbackText.trim();
                if (!text) {
                    setDrillError(
                        "Say or type why you’re skipping before you continue.",
                    );
                    return;
                }
                fd.append("feedbackText", text);
            }
            await ky.post("/api/sessions/skip", {
                body: fd,
                timeout: 120_000,
            });
            setSkipModalOpen(false);
            setSkipFeedbackText("");
        } catch (error) {
            console.error(
                "[components/session/session-home] submitSkipDrill failed",
                error,
            );
            setDrillError(
                await getKyErrorMessage(error, "Could not skip this drill."),
            );
            return;
        } finally {
            setSkipSubmitting(false);
        }
        await createNewDrillRequest();
    };

    const submitReflectionThenNewDrill = async (opts: {
        mode: "share" | "decline" | "clear";
    }) => {
        const ctx = preNewDrillReflection;
        if (!ctx) return;
        setReflectionSubmitting(true);
        setDrillError(null);
        try {
            if (opts.mode === "clear") {
                if (modalRecorder.isRecording) {
                    await modalRecorder.stop();
                }
                setReflectionModalOpen(false);
                setReflectionFeedbackText("");
                setPreNewDrillReflection(null);
                await createNewDrillRequest();
                return;
            }

            if (opts.mode === "decline" && modalRecorder.isRecording) {
                await modalRecorder.stop();
            }

            const fd = new FormData();
            fd.append("uid", uid);
            fd.append("priorSessionId", ctx.priorSessionId);
            if (opts.mode === "decline") {
                fd.append("dismissWithoutSharing", "1");
            } else {
                const text = reflectionFeedbackText.trim();
                if (!text) {
                    setDrillError(
                        "Say or type your answer before you continue.",
                    );
                    return;
                }
                fd.append("feedbackText", text);
            }
            await ky.post("/api/sessions/reflection", {
                body: fd,
                timeout: 120_000,
            });
            setReflectionModalOpen(false);
            setReflectionFeedbackText("");
            setPreNewDrillReflection(null);
            await createNewDrillRequest();
        } catch (error) {
            console.error(
                "[components/session/session-home] submitReflectionThenNewDrill failed",
                error,
            );
            setDrillError(
                await getKyErrorMessage(
                    error,
                    "Could not save your reflection.",
                ),
            );
        } finally {
            setReflectionSubmitting(false);
        }
    };

    const startAnotherDrill = async () => {
        setDrillError(null);
        setHasPendingAnalysisRequest(false);
        const s = session;
        if (
            s?.id &&
            s.completionStatus === "passed" &&
            hasSessionFeedbackContent(s.feedback) &&
            Math.random() < REFLECTION_BEFORE_NEW_DRILL_PROBABILITY
        ) {
            setReflectionTranscribeError(null);
            setPreNewDrillReflection({
                priorSessionId: s.id,
                scenarioTitle:
                    s.plan.scenario.title.trim() || "your last drill",
            });
            setReflectionModalOpen(true);
            return;
        }
        await createNewDrillRequest();
    };

    const seekToSecond = (seconds: number) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(seconds)) return;
        el.currentTime = Math.max(0, seconds);
        void el.play();
    };

    const isDrillView = view === "drill";
    const isReviewView = view === "review";

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <SessionHomeHeader userLabel={userLabel} onSignOut={onSignOut} />

            {isDrillView ? (
                <>
                    <DrillBriefCard
                        plan={currentPlan}
                        shouldShowResults={shouldShowResults}
                        loadingSession={loadingSession}
                        isCreatingDrill={isCreatingDrill}
                        requiresRetry={requiresRetry}
                        reflectionModalOpen={reflectionModalOpen}
                        reflectionSubmitting={reflectionSubmitting}
                        skipSubmitting={skipSubmitting}
                        onStartAnotherDrill={startAnotherDrill}
                    />

                    {loadingSession ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                            Syncing your latest drill...
                        </p>
                    ) : null}
                    {drillError ? (
                        <p className="mt-3 text-sm text-destructive" role="alert">
                            {drillError}
                        </p>
                    ) : null}

                    <SessionControlsPanel
                        mm={mm}
                        ss={ss}
                        stateLabel={stateLabel}
                        requiresRetry={requiresRetry}
                        isRecording={isRecording}
                        stream={stream}
                        showRecordAction={showRecordAction}
                        showCompletionActions={showCompletionActions}
                        showSkipDrill={showSkipDrill}
                        skipSubmitting={skipSubmitting}
                        isCreatingDrill={isCreatingDrill}
                        drillState={drillState}
                        hasPendingAnalysisRequest={hasPendingAnalysisRequest}
                        shouldShowResults={shouldShowResults}
                        shouldShowAnalyzingState={shouldShowAnalyzingState}
                        playbackSrc={playbackSrc}
                        audioRef={audioRef}
                        onStartRecording={() => void startRecording()}
                        onStopRecording={() => void stopRecording()}
                        onOpenSkipModal={() => {
                            modalRecorder.clearError();
                            setSkipTranscribeError(null);
                            setSkipFeedbackText("");
                            setSkipModalOpen(true);
                        }}
                        onRedoDrill={() => void startRecording()}
                    />

                    {shouldShowResults && !isSkipped ? (
                        <div className="mt-4 flex justify-center">
                            <Button
                                variant="default"
                                onClick={() => setView("review")}
                            >
                                View feedback
                                <ArrowRight />
                            </Button>
                        </div>
                    ) : null}
                </>
            ) : null}

            {isReviewView ? (
                <>
                    <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                    Feedback for
                                </p>
                                <h2 className="mt-1 text-lg font-semibold">
                                    {currentPlan.scenario.title}
                                </h2>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setView("drill")}
                                >
                                    <ArrowLeft />
                                    Back to drill
                                </Button>
                                <Button
                                    onClick={() => void startAnotherDrill()}
                                    disabled={
                                        loadingSession ||
                                        isCreatingDrill ||
                                        requiresRetry ||
                                        reflectionModalOpen ||
                                        reflectionSubmitting ||
                                        skipSubmitting
                                    }
                                >
                                    <ArrowRight />
                                    {isCreatingDrill
                                        ? "Building next drill..."
                                        : "Start another drill"}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {playbackSrc ? (
                        <AudioPlayer
                            src={playbackSrc}
                            audioRef={audioRef}
                            className="mt-4"
                        />
                    ) : null}

                    <SessionFeedbackSection
                        shouldShowResults={shouldShowResults}
                        isSkipped={isSkipped}
                        currentTranscript={currentTranscript}
                        currentFeedback={currentFeedback}
                        hasMainOverview={hasMainOverview}
                        coachingSectionKeys={coachingSectionKeys}
                        requiresRetry={requiresRetry}
                        completionReason={session?.completionReason ?? null}
                        onSeekToSecond={seekToSecond}
                        sessionId={session?.id}
                        uid={uid}
                    />
                </>
            ) : null}

            <SkipDrillModal
                open={skipModalOpen}
                skipFeedbackText={skipFeedbackText}
                onSkipFeedbackTextChange={setSkipFeedbackText}
                skipSubmitting={skipSubmitting}
                isTranscribing={skipTranscribing}
                transcribeError={skipTranscribeError}
                modalRecorder={modalRecorder}
                onToggleSpeak={() => void toggleSkipVoiceNote()}
                onSubmit={(o) => void submitSkipDrill(o)}
                onCancel={() => {
                    setSkipTranscribeError(null);
                    setSkipModalOpen(false);
                }}
            />

            <NewDrillReflectionModal
                open={reflectionModalOpen}
                context={preNewDrillReflection}
                reflectionFeedbackText={reflectionFeedbackText}
                onReflectionFeedbackTextChange={setReflectionFeedbackText}
                reflectionSubmitting={reflectionSubmitting}
                isTranscribing={reflectionTranscribing}
                transcribeError={reflectionTranscribeError}
                modalRecorder={modalRecorder}
                onToggleSpeak={() => void toggleReflectionVoiceNote()}
                onAction={(mode) => void submitReflectionThenNewDrill({ mode })}
            />

            {authError ? (
                <p className="mt-4 text-xs text-destructive" role="alert">
                    {authError}
                </p>
            ) : null}
        </section>
    );
}
