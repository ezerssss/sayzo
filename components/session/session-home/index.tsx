"use client";

import { ChevronDown, Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { AudioPlayer } from "@/components/session/audio-player";
import { Eyebrow } from "@/components/app/eyebrow";
import { HeroPanel } from "@/components/app/hero-panel";
import { PageTour } from "@/components/tour/page-tour";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api-client";
import {
    getKyErrorMessage,
    isKyHttpStatus,
    isKyTimeoutLikeError,
} from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";
import type { SessionFeedbackType } from "@/schemas";

import {
    DEFAULT_MAX_SECONDS,
    FALLBACK_PLAN,
    HARD_MAX_SECONDS,
} from "./constants";
import { DrillBriefCard } from "./drill-brief-card";
import { SessionFeedbackSection } from "./session-feedback-section";
import type { DrillState, SessionHomeProps } from "./types";

export type { SessionHomeProps } from "./types";

function formatReviewDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return dateStr;
    }
}

export function SessionHome(props: Readonly<SessionHomeProps>) {
    const { uid, authError, sessionId } = props;
    const creditGate = useCreditGate();

    const [drillState, setDrillState] = useState<DrillState>("idle");
    const [seconds, setSeconds] = useState(DEFAULT_MAX_SECONDS);
    const [drillError, setDrillError] = useState<string | null>(null);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(
        null,
    );
    const [hasPendingAnalysisRequest, setHasPendingAnalysisRequest] =
        useState(false);
    const [promptOpen, setPromptOpen] = useState(true);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { isRecording, stream, start, stop } = useVoiceRecorder();

    const {
        session,
        loading: loadingSession,
        error: latestSessionError,
    } = useSession(sessionId);

    const currentPlan = session?.plan ?? FALLBACK_PLAN;
    const maxSeconds = Math.max(
        15,
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
    const hasFeedback = Boolean(
        session?.feedback?.improvedVersion?.trim() || session?.analysis,
    );
    const hasServerResults = Boolean(
        session?.completionStatus !== "pending" &&
        (isSkipped || session?.transcript?.trim() || hasFeedback),
    );
    const shouldShowResults = hasServerResults;
    const showRecordAction =
        !isSkipped && (isRecordingNow || !shouldShowResults || requiresRetry);
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
        if (isRecording || drillState === "recording") return;
        // Pending submission OR server is processing → analyzing.
        // Checked BEFORE hasServerResults so retry submissions don't get
        // overridden by stale results from the prior take.
        if (hasPendingAnalysisRequest || isServerProcessing) {
            setDrillState("analyzing");
            return;
        }
        if (hasServerResults) {
            setDrillState("complete");
            setSeconds(0);
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

    // Only clear pending once the server is processing (then isServerProcessing
    // is the source of truth) — clearing on hasServerResults would wipe the
    // flag on retry attempts before the new server work starts, since the
    // prior take's results are still in `session`.
    useEffect(() => {
        if (isServerProcessing) {
            setHasPendingAnalysisRequest(false);
        }
    }, [isServerProcessing]);

    const completedSessionIdRef = useRef<string | null>(null);
    useEffect(() => {
        const id = session?.id;
        const status = session?.completionStatus;
        if (!id || !status || status === "pending") return;
        if (completedSessionIdRef.current === id) return;
        completedSessionIdRef.current = id;
        track("drill_completed", { completion_status: status });
    }, [session?.id, session?.completionStatus]);

    // Auto-stop at 0:00. The recorder is still running when the timer ticks
    // down, so we trigger stopRecording() (which posts the audio) instead of
    // just flipping the state — otherwise the audio never makes it server-side.
    const stopRecordingRef = useRef<() => Promise<void>>(async () => {});
    useEffect(() => {
        if (drillState !== "recording") return;
        const id = setInterval(() => {
            setSeconds((s) => {
                if (s <= 1) {
                    void stopRecordingRef.current();
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [drillState]);

    useEffect(() => {
        return () => {
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
        };
    }, [recordedAudioUrl]);

    const needsRetry =
        session?.completionStatus === "needs_retry" &&
        !isServerProcessing &&
        !hasPendingAnalysisRequest;
    const stateLabel = useMemo(() => {
        if (isRecording || drillState === "recording") {
            return "Recording your response…";
        }
        if (hasPendingAnalysisRequest) return "Starting analysis…";
        if (isServerProcessing) {
            switch (processingStage) {
                case "transcribing":
                    return "Transcribing your response…";
                case "uploading":
                    return "Uploading your audio…";
                case "analyzing":
                    return "Analyzing your transcript…";
                case "combining":
                    return "Wrapping up your feedback…";
                default:
                    return "Still processing…";
            }
        }
        if (drillState === "analyzing") return "Syncing latest status…";
        if (drillState === "complete") {
            if (isSkipped) return "This replay was skipped.";
            if (needsRetry) {
                return "Listen to your last take, then tap Try again.";
            }
            return "Session complete. Review your feedback below.";
        }
        return "Tap to start when you're ready.";
    }, [
        drillState,
        hasPendingAnalysisRequest,
        isRecording,
        isServerProcessing,
        processingStage,
        isSkipped,
        needsRetry,
    ]);

    const startRecording = async () => {
        if (session?.completionStatus === "skipped") return;
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
        if (session?.completionStatus === "skipped") return;
        const durationSec = Math.max(0, maxSeconds - seconds);
        setHasPendingAnalysisRequest(true);
        const result = await stop();
        if (result?.blob.size) {
            if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioUrl(URL.createObjectURL(result.blob));
        }
        setSeconds(0);
        setDrillState("analyzing");

        if (!session?.id || !result?.blob.size) {
            setDrillError("No active replay found to save this recording.");
            setHasPendingAnalysisRequest(false);
            setDrillState("idle");
            return;
        }

        try {
            const fd = new FormData();
            fd.append("sessionId", session.id);
            fd.append(
                "audio",
                new File([result.blob], "response.webm", {
                    type: result.mimeType,
                }),
            );
            track("drill_submitted", { duration_sec: durationSec });
            await api.post("/api/sessions/complete", {
                body: fd,
                timeout: 330_000,
            });
            setHasPendingAnalysisRequest(false);
            setDrillState("complete");
        } catch (error) {
            if (isKyHttpStatus(error, 402)) {
                track("credit_limit_reached", { feature: "drill" });
                creditGate.openLimitDialog();
                setHasPendingAnalysisRequest(false);
                setDrillState("idle");
                return;
            }
            console.error(
                "[components/session/session-home] stopRecording failed",
                error,
            );
            if (isKyTimeoutLikeError(error)) {
                setDrillError(
                    "Still processing in the background. We'll update once results are ready.",
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

    // Keep the latest stopRecording reachable from the timer effect without
    // re-firing the interval on every render.
    useEffect(() => {
        stopRecordingRef.current = stopRecording;
    });

    const [isRetrying, setIsRetrying] = useState(false);
    const requestVoluntaryRetry = async () => {
        if (!session?.id) return;
        setIsRetrying(true);
        try {
            await api.post("/api/sessions/retry", {
                json: { sessionId: session.id },
            });
            track("drill_voluntary_retry", {});
            // Firestore listener will pick up the new completionStatus
            // ("needs_retry") and the page re-renders into the retry UI.
        } catch (error) {
            setDrillError(
                await getKyErrorMessage(error, "Could not retry this replay."),
            );
        } finally {
            setIsRetrying(false);
        }
    };

    const seekToSecond = (s: number) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(s)) return;
        el.currentTime = Math.max(0, s);
        void el.play();
    };

    return (
        <div className="space-y-8">
            {session ? (
                <HeroPanel>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                            <Eyebrow tone="sky">
                                {isSkipped
                                    ? "Skipped replay"
                                    : shouldShowResults
                                      ? "Replay feedback"
                                      : "Replay"}
                                {session.createdAt ? (
                                    <>
                                        <span className="mx-1.5 text-sky-700/50">
                                            &middot;
                                        </span>
                                        <span className="font-normal normal-case text-foreground/80">
                                            {formatReviewDate(
                                                session.createdAt,
                                            )}
                                        </span>
                                    </>
                                ) : null}
                            </Eyebrow>
                            <h2 className="mt-2 text-xl font-semibold tracking-tight">
                                {currentPlan.scenario.title}
                            </h2>
                        </div>
                        {shouldShowResults &&
                        !isSkipped &&
                        session.completionStatus === "passed" ? (
                            <div className="relative flex shrink-0 flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    data-tour="retry-replay"
                                    onClick={() => void requestVoluntaryRetry()}
                                    disabled={loadingSession || isRetrying}
                                >
                                    <RotateCcw />
                                    {isRetrying
                                        ? "Setting up retry…"
                                        : "Retry this replay"}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </HeroPanel>
            ) : null}

            {/* Active drill — prompt + record button */}
            {!shouldShowResults && !isSkipped ? (
                <>
                    <DrillBriefCard plan={currentPlan} />

                    {loadingSession ? (
                        <p className="text-sm text-muted-foreground">
                            Syncing your replay…
                        </p>
                    ) : null}
                    {drillError ? (
                        <p className="text-sm text-destructive" role="alert">
                            {drillError}
                        </p>
                    ) : null}

                    <RecordPanel
                        mm={mm}
                        ss={ss}
                        stateLabel={stateLabel}
                        isRecording={isRecording}
                        stream={stream}
                        requiresRetry={requiresRetry}
                        showRecordAction={showRecordAction}
                        shouldShowAnalyzingState={shouldShowAnalyzingState}
                        drillState={drillState}
                        onStartRecording={() => void startRecording()}
                        onStopRecording={() => void stopRecording()}
                    />
                </>
            ) : null}

            {/* Completed drill — collapsible prompt + audio + feedback */}
            {shouldShowResults && !isSkipped ? (
                <>
                    <div>
                        <button
                            type="button"
                            onClick={() => setPromptOpen((v) => !v)}
                            className="flex w-full items-center justify-between"
                        >
                            <span className="text-sm font-medium">
                                Replay prompt
                            </span>
                            <ChevronDown
                                className={cn(
                                    "size-4 text-muted-foreground transition-transform",
                                    promptOpen && "rotate-180",
                                )}
                            />
                        </button>
                        {promptOpen ? (
                            <div className="mt-3 border-t border-border/50 pt-3">
                                <DrillBriefCard
                                    plan={currentPlan}
                                    autoPlay={false}
                                />
                            </div>
                        ) : null}
                    </div>

                    {/* Hidden while live-recording so it doesn't compete with the waveform — otherwise always visible so users in needs_retry can listen back before re-recording. */}
                    {playbackSrc && !isRecordingNow ? (
                        <AudioPlayer src={playbackSrc} audioRef={audioRef} />
                    ) : null}

                    {requiresRetry ||
                    isRecordingNow ||
                    drillState === "analyzing" ? (
                        <RecordPanel
                            mm={mm}
                            ss={ss}
                            stateLabel={stateLabel}
                            isRecording={isRecording}
                            stream={stream}
                            requiresRetry={requiresRetry}
                            showRecordAction={showRecordAction}
                            shouldShowAnalyzingState={shouldShowAnalyzingState}
                            drillState={drillState}
                            onStartRecording={() => void startRecording()}
                            onStopRecording={() => void stopRecording()}
                        />
                    ) : null}

                    <SessionFeedbackSection
                        shouldShowResults={shouldShowResults}
                        isSkipped={isSkipped}
                        currentTranscript={currentTranscript}
                        currentServerTranscript={
                            session?.serverTranscript ?? null
                        }
                        currentAnalysis={session?.analysis ?? null}
                        currentFeedback={currentFeedback}
                        requiresRetry={requiresRetry}
                        completionReason={session?.completionReason ?? null}
                        onSeekToSecond={seekToSecond}
                        sessionId={session?.id}
                        uid={uid}
                    />
                </>
            ) : null}

            {isSkipped ? (
                <SessionFeedbackSection
                    shouldShowResults={shouldShowResults}
                    isSkipped={isSkipped}
                    currentTranscript={currentTranscript}
                    currentServerTranscript={session?.serverTranscript ?? null}
                    currentAnalysis={session?.analysis ?? null}
                    currentFeedback={currentFeedback}
                    requiresRetry={requiresRetry}
                    completionReason={session?.completionReason ?? null}
                    onSeekToSecond={seekToSecond}
                    sessionId={session?.id}
                    uid={uid}
                />
            ) : null}

            {authError ? (
                <p className="mt-4 text-xs text-destructive" role="alert">
                    {authError}
                </p>
            ) : null}

            {/* One-time page guide — arms only once feedback results
                    (and their tour targets) are on screen. */}
            <PageTour
                page="replay"
                uid={uid}
                ready={Boolean(shouldShowResults && !isSkipped)}
            />
        </div>
    );
}

type RecordPanelProps = {
    mm: number;
    ss: number;
    stateLabel: string;
    isRecording: boolean;
    stream: MediaStream | null;
    requiresRetry: boolean;
    showRecordAction: boolean;
    shouldShowAnalyzingState: boolean;
    drillState: DrillState;
    onStartRecording: () => void;
    onStopRecording: () => void;
};

function RecordPanel(props: Readonly<RecordPanelProps>) {
    const {
        mm,
        ss,
        stateLabel,
        isRecording,
        stream,
        requiresRetry,
        showRecordAction,
        shouldShowAnalyzingState,
        drillState,
        onStartRecording,
        onStopRecording,
    } = props;

    const isAnalyzing = shouldShowAnalyzingState || drillState === "analyzing";

    return (
        <div className="rounded-2xl border border-border/60 bg-background p-6">
            <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{stateLabel}</p>
                {isRecording ? (
                    <span className="font-mono text-xs text-muted-foreground">
                        {mm}:{ss.toString().padStart(2, "0")}
                    </span>
                ) : null}
            </div>

            {isRecording ? (
                <div className="mt-4">
                    <LiveWaveform stream={stream} active={isRecording} />
                </div>
            ) : null}

            {showRecordAction ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {isRecording ? (
                        <Button
                            size="lg"
                            variant="destructive"
                            onClick={onStopRecording}
                        >
                            <Square />
                            Stop
                        </Button>
                    ) : (
                        <Button
                            size="lg"
                            onClick={onStartRecording}
                            disabled={isAnalyzing}
                        >
                            <Mic />
                            {requiresRetry ? "Try again" : "Start recording"}
                        </Button>
                    )}
                </div>
            ) : null}
        </div>
    );
}
