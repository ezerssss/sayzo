"use client";

import {
    ArrowRight,
    Loader2,
    Mic,
    Play,
    RotateCcw,
    Square,
} from "lucide-react";
import ky from "ky";
import { useEffect, useMemo, useRef, useState } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useLatestSession } from "@/hooks/use-latest-session";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import type { SessionFeedbackType, SessionPlanType } from "@/types/sessions";
import { FeedbackPanel } from "@/components/session/feedback-panel";
import { MarkdownBlock } from "@/components/session/markdown-block";
import { TranscriptPanel } from "@/components/session/transcript-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    getKyErrorMessage,
    isKyTimeoutLikeError,
} from "@/lib/ky-error-message";

interface PropsInterface {
    uid: string;
    userLabel: string;
    onSignOut: () => void;
    authError?: string | null;
}

type DrillState = "idle" | "recording" | "analyzing" | "complete";

const DEFAULT_MAX_SECONDS = 5 * 60; // Fallback max time allowed for a drill.
const HARD_MAX_SECONDS = 30 * 60; // Absolute safety cap.
const EMPTY_CAPTIONS_VTT = "data:text/vtt,WEBVTT";

const FALLBACK_PLAN: SessionPlanType = {
    scenario: {
        title: "Practice Drill",
        situationContext:
            "You are giving a brief professional update to your team.",
        givenContent:
            "Summarize what changed, why it matters, and what you need from stakeholders.",
        framework:
            "Use PREP: Point -> Reason -> Example -> Point. Keep it concise and confident.",
        category: "status_update",
    },
    skillTarget: "Concise structure",
    maxDurationSeconds: DEFAULT_MAX_SECONDS,
};

const FEEDBACK_SECTION_LABELS: Record<keyof SessionFeedbackType, string> = {
    overview: "Overview",
    momentsToTighten: "Moments",
    structureAndFlow: "Structure",
    clarityAndConciseness: "Clarity",
    relevanceAndFocus: "Relevance",
    engagement: "Engagement",
    professionalism: "Professionalism",
    deliveryAndProsody: "Voice & tone",
    betterOptions: "Better options",
    nextRepetition: "Next repetition",
    whatWorkedWell: "What worked well",
};

// Transcript + feedback rendering live in dedicated components.

export function SessionHome(props: Readonly<PropsInterface>) {
    const { uid, userLabel, onSignOut, authError } = props;
    const [drillState, setDrillState] = useState<DrillState>("idle");
    const [seconds, setSeconds] = useState(DEFAULT_MAX_SECONDS);
    const [drillError, setDrillError] = useState<string | null>(null);
    const [isCreatingDrill, setIsCreatingDrill] = useState(false);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(
        null,
    );
    const [hasPendingAnalysisRequest, setHasPendingAnalysisRequest] =
        useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const {
        session,
        loading: loadingSession,
        error: latestSessionError,
    } = useLatestSession(uid);

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
    const practiceSectionKeys = useMemo<Array<keyof SessionFeedbackType>>(() => {
        if (!currentFeedback) return [];
        const keys: Array<keyof SessionFeedbackType> = [
            "betterOptions",
            "nextRepetition",
            "whatWorkedWell",
        ];
        return keys.filter((key) => {
            const value = currentFeedback[key];
            return typeof value === "string" && value.trim().length > 0;
        });
    }, [currentFeedback]);
    const hasSinglePracticeSection = practiceSectionKeys.length === 1;

    const playbackSrc = recordedAudioUrl ?? session?.audioUrl ?? null;
    const isRecordingNow = isRecording || drillState === "recording";
    const isServerProcessing = session?.processingStatus === "processing";
    const requiresRetry =
        session?.completionStatus === "needs_retry" &&
        !isServerProcessing &&
        !isRecordingNow &&
        drillState !== "analyzing";
    const processingStage = session?.processingStage;
    const hasServerResults = Boolean(
        session?.completionStatus !== "pending" &&
            (session?.transcript?.trim() || hasFeedback),
    );
    const shouldShowResults = hasServerResults;
    const showRecordAction =
        isRecordingNow || !shouldShowResults || requiresRetry;
    const showCompletionActions =
        shouldShowResults &&
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
        // Snapshot is source of truth: clear transient local timeout error
        // once server state advances or final results are available.
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

    // `complete` is set when server-side transcription + analysis finishes.

    const stateLabel = useMemo(() => {
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
            return "Session complete. Review your feedback below.";
        }
        return "Ready when you are.";
    }, [
        drillState,
        hasPendingAnalysisRequest,
        isRecording,
        isServerProcessing,
        processingStage,
    ]);

    const startRecording = async () => {
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
            console.error("[components/session/session-home] stopRecording failed", error);
            if (isKyTimeoutLikeError(error)) {
                setDrillError(
                    "Still processing in the background. We will update once results are ready.",
                );
                return;
            }
            setDrillError(
                await getKyErrorMessage(error, "Could not analyze your response."),
            );
            setHasPendingAnalysisRequest(false);
            setDrillState("idle");
        }
    };

    const startAnotherDrill = async () => {
        setDrillError(null);
        setHasPendingAnalysisRequest(false);
        setIsCreatingDrill(true);
        try {
            await ky.post("/api/sessions/new-drill", {
                json: { uid },
                timeout: 330_000,
            });
            setSeconds(maxSeconds);
            setDrillState("idle");
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
                setRecordedAudioUrl(null);
            }
        } catch (error) {
            console.error(
                "[components/session/session-home] startAnotherDrill failed",
                error,
            );
            setDrillError(
                await getKyErrorMessage(error, "Could not create a new drill."),
            );
        } finally {
            setIsCreatingDrill(false);
        }
    };

    const seekToSecond = (seconds: number) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(seconds)) return;
        el.currentTime = Math.max(0, seconds);
        void el.play();
    };

    const practiceTabContent = (() => {
        if (!currentFeedback || practiceSectionKeys.length === 0) {
            return (
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm font-medium">Practice</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Waiting for practice guidance…
                    </p>
                </div>
            );
        }
        if (hasSinglePracticeSection) {
            return (
                <FeedbackPanel
                    feedback={currentFeedback}
                    onSeekToSecond={seekToSecond}
                    needsRetry={requiresRetry}
                    completionReason={session?.completionReason ?? null}
                    sectionKey={practiceSectionKeys[0]}
                />
            );
        }
        return (
            <Tabs
                defaultValue={`practice-${practiceSectionKeys[0]}`}
                className="space-y-3"
            >
                <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                    {practiceSectionKeys.map((key) => (
                        <TabsTrigger
                            key={`practice-trigger-${key}`}
                            value={`practice-${key}`}
                            className="shrink-0"
                        >
                            {FEEDBACK_SECTION_LABELS[key]}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {practiceSectionKeys.map((key) => (
                    <TabsContent
                        key={`practice-content-${key}`}
                        value={`practice-${key}`}
                    >
                        <FeedbackPanel
                            feedback={currentFeedback}
                            onSeekToSecond={seekToSecond}
                            needsRetry={requiresRetry}
                            completionReason={session?.completionReason ?? null}
                            sectionKey={key}
                        />
                    </TabsContent>
                ))}
            </Tabs>
        );
    })();

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        You&apos;re in
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Signed in as{" "}
                        <span className="font-medium text-foreground">
                            {userLabel}
                        </span>
                    </p>
                </div>
                <Button variant="outline" onClick={onSignOut}>
                    Sign out
                </Button>
            </div>

            <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Today&apos;s Drill
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                            {currentPlan.scenario.title}
                        </h2>
                    </div>
                    {shouldShowResults ? (
                        <Button
                            onClick={() => void startAnotherDrill()}
                            disabled={
                                loadingSession || isCreatingDrill || requiresRetry
                            }
                        >
                            <ArrowRight />
                            {isCreatingDrill
                                ? "Building next drill..."
                                : "Start another drill"}
                        </Button>
                    ) : null}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    {currentPlan.scenario.situationContext}
                </p>
                <MarkdownBlock
                    className="mt-3"
                    markdown={currentPlan.scenario.givenContent}
                />
                <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                        Framework
                    </p>
                    <MarkdownBlock
                        className="mt-2"
                        markdown={currentPlan.scenario.framework}
                    />
                </div>
                <div className="mt-3 rounded-lg border border-border/60 bg-background/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                        Skill target
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {currentPlan.skillTarget}
                    </p>
                </div>
            </div>
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

            <div className="mt-6 rounded-xl border border-border/70 p-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Session status</p>
                    <span className="font-mono text-sm">{`${mm}:${ss.toString().padStart(2, "0")}`}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                    {stateLabel}
                </p>
                {requiresRetry ? (
                    <p className="mt-2 text-sm text-amber-700">
                        Please redo this drill before creating a new one.
                    </p>
                ) : null}
                {isRecording ? (
                    <LiveWaveform stream={stream} active className="mt-3" />
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    {showRecordAction ? (
                        <Button
                            variant={isRecording ? "secondary" : "outline"}
                            disabled={
                                drillState === "analyzing" ||
                                hasPendingAnalysisRequest
                            }
                            onClick={() =>
                                void (isRecording
                                    ? stopRecording()
                                    : startRecording())
                            }
                        >
                            {isRecording ? <Square /> : <Mic />}
                            {isRecording ? "Stop recording" : "Record response"}
                        </Button>
                    ) : null}
                    {showCompletionActions ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    void audioRef.current?.play();
                                }}
                                disabled={!playbackSrc}
                            >
                                <Play />
                                Listen to response
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => void startRecording()}
                            >
                                <RotateCcw />
                                Redo this drill
                            </Button>
                        </>
                    ) : null}
                </div>
                {shouldShowResults && playbackSrc ? (
                    <audio
                        id="session-audio-playback"
                        ref={audioRef}
                        className="mt-4 w-full"
                        controls
                        src={playbackSrc}
                    >
                        <track
                            kind="captions"
                            label="English captions"
                            srcLang="en"
                            src={EMPTY_CAPTIONS_VTT}
                            default
                        />
                    </audio>
                ) : null}
                {shouldShowAnalyzingState ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {stateLabel}
                    </div>
                ) : null}
            </div>

            {shouldShowResults ? (
                <Tabs defaultValue="main" className="mt-6">
                    <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                        <TabsTrigger value="main" className="shrink-0">
                            Main
                        </TabsTrigger>
                        <TabsTrigger value="coaching" className="shrink-0">
                            Coaching
                        </TabsTrigger>
                        <TabsTrigger value="practice" className="shrink-0">
                            Practice
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="main" className="mt-3 space-y-4">
                        {hasMainOverview && currentFeedback ? (
                            <FeedbackPanel
                                feedback={currentFeedback}
                                onSeekToSecond={seekToSecond}
                                needsRetry={requiresRetry}
                                completionReason={session?.completionReason ?? null}
                                sectionKey="overview"
                            />
                        ) : (
                            <div className="rounded-xl border border-border/70 p-4">
                                <p className="text-sm font-medium">Overview</p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Waiting for overview…
                                </p>
                            </div>
                        )}
                        {currentTranscript ? (
                            <TranscriptPanel
                                transcript={currentTranscript}
                                onSeekToSecond={seekToSecond}
                            />
                        ) : (
                            <div className="rounded-xl border border-border/70 p-4">
                                <p className="text-sm font-medium">Transcript</p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Waiting for transcription…
                                </p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="coaching" className="mt-3">
                        {currentFeedback && coachingSectionKeys.length > 0 ? (
                            <Tabs
                                defaultValue={`coaching-${coachingSectionKeys[0]}`}
                                className="space-y-3"
                            >
                                <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                                    {coachingSectionKeys.map((key) => (
                                        <TabsTrigger
                                            key={`coaching-trigger-${key}`}
                                            value={`coaching-${key}`}
                                            className="shrink-0"
                                        >
                                            {FEEDBACK_SECTION_LABELS[key]}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {coachingSectionKeys.map((key) => (
                                    <TabsContent
                                        key={`coaching-content-${key}`}
                                        value={`coaching-${key}`}
                                    >
                                        <FeedbackPanel
                                            feedback={currentFeedback}
                                            onSeekToSecond={seekToSecond}
                                            needsRetry={requiresRetry}
                                            completionReason={
                                                session?.completionReason ?? null
                                            }
                                            sectionKey={key}
                                        />
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : (
                            <div className="rounded-xl border border-border/70 p-4">
                                <p className="text-sm font-medium">Coaching</p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Waiting for coaching feedback…
                                </p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="practice" className="mt-3">
                        {practiceTabContent}
                    </TabsContent>
                </Tabs>
            ) : null}

            {authError ? (
                <p className="mt-4 text-xs text-destructive" role="alert">
                    {authError}
                </p>
            ) : null}
        </section>
    );
}
