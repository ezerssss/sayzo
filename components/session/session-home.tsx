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
import { useEffect, useMemo, useState } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useLatestSession } from "@/hooks/use-latest-session";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import type { SessionPlanType } from "@/types/sessions";
import { FeedbackPanel } from "@/components/session/feedback-panel";
import { MarkdownBlock } from "@/components/session/markdown-block";
import { TranscriptPanel } from "@/components/session/transcript-panel";

interface PropsInterface {
    uid: string;
    userLabel: string;
    onSignOut: () => void;
    authError?: string | null;
}

type DrillState = "idle" | "recording" | "analyzing" | "complete";

const MAX_SECONDS = 5 * 60; // Max time allowed for a drill.
const EMPTY_CAPTIONS_VTT = "data:text/vtt,WEBVTT";

const FALLBACK_PLAN: SessionPlanType = {
    scenario: {
        title: "Practice Drill",
        situationContext:
            "You are presenting a brief professional update to your team.",
        givenContent:
            "Summarize what changed, why it matters, and what you need from stakeholders.",
        task: "Keep your response clear, concise, and confident.",
    },
    focus: ["Concise structure"],
};

// Transcript + feedback rendering live in dedicated components.

export function SessionHome(props: Readonly<PropsInterface>) {
    const { uid, userLabel, onSignOut, authError } = props;
    const [drillState, setDrillState] = useState<DrillState>("idle");
    const [seconds, setSeconds] = useState(MAX_SECONDS);
    const [drillError, setDrillError] = useState<string | null>(null);
    const [isCreatingDrill, setIsCreatingDrill] = useState(false);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(
        null,
    );
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const {
        session,
        loading: loadingSession,
        error: latestSessionError,
    } = useLatestSession(uid);

    const currentPlan = session?.plan ?? FALLBACK_PLAN;
    const currentTranscript = useMemo(() => {
        return session?.transcript?.trim() ?? "";
    }, [session?.transcript]);

    const currentFeedback = useMemo(() => {
        return session?.feedback?.trim() ?? "";
    }, [session?.feedback]);

    const playbackSrc = recordedAudioUrl ?? session?.audioUrl ?? null;
    const hasServerResults = Boolean(
        session?.audioUrl &&
            (session?.transcript?.trim() || session?.feedback?.trim()),
    );

    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;

    useEffect(() => {
        setDrillError(latestSessionError);
    }, [latestSessionError]);

    useEffect(() => {
        if (!session) return;
        if (isRecording || drillState === "analyzing" || drillState === "recording") {
            return;
        }
        if (hasServerResults) {
            setDrillState("complete");
            setSeconds(0);
            return;
        }
        setDrillState("idle");
        setSeconds(MAX_SECONDS);
    }, [drillState, hasServerResults, isRecording, session]);

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
        if (drillState === "analyzing") {
            return "Analyzing your session...";
        }
        if (drillState === "complete") {
            return "Session complete. Review your feedback below.";
        }
        return "Ready when you are.";
    }, [drillState, isRecording]);

    const startRecording = async () => {
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioUrl(null);
        }
        setSeconds(MAX_SECONDS);
        setDrillState("recording");
        await start();
    };

    const stopRecording = async () => {
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
                timeout: 300_000,
            });
            setDrillState("complete");
        } catch (error) {
            setDrillError(
                error instanceof Error
                    ? error.message
                    : "Could not analyze your response.",
            );
            setDrillState("idle");
        }
    };

    const startAnotherDrill = async () => {
        setDrillError(null);
        setIsCreatingDrill(true);
        try {
            await ky.post("/api/sessions/new-drill", {
                json: { uid },
                timeout: 60_000,
            });
            setSeconds(MAX_SECONDS);
            setDrillState("idle");
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
                setRecordedAudioUrl(null);
            }
        } catch (error) {
            setDrillError(
                error instanceof Error
                    ? error.message
                    : "Could not create a new drill.",
            );
        } finally {
            setIsCreatingDrill(false);
        }
    };

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
                    {drillState === "complete" ? (
                        <Button
                            onClick={() => void startAnotherDrill()}
                            disabled={loadingSession || isCreatingDrill}
                        >
                            <ArrowRight />
                            {isCreatingDrill
                                ? "Creating another drill..."
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
                        Task
                    </p>
                    <MarkdownBlock
                        className="mt-2"
                        markdown={currentPlan.scenario.task}
                    />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {currentPlan.focus.map((item) => (
                        <span
                            key={item}
                            className="rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                        >
                            {item}
                        </span>
                    ))}
                </div>
            </div>
            {loadingSession ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    Loading latest drill...
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
                {isRecording ? (
                    <LiveWaveform stream={stream} active className="mt-3" />
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    {drillState === "complete" ? null : (
                        <Button
                            variant={isRecording ? "secondary" : "outline"}
                            disabled={drillState === "analyzing"}
                            onClick={() =>
                                void (isRecording
                                    ? stopRecording()
                                    : startRecording())
                            }
                        >
                            {isRecording ? <Square /> : <Mic />}
                            {isRecording ? "Stop recording" : "Record response"}
                        </Button>
                    )}
                    {drillState === "complete" ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const el = document.getElementById(
                                        "session-audio-playback",
                                    ) as HTMLAudioElement | null;
                                    void el?.play();
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
                {drillState === "complete" && playbackSrc ? (
                    <audio
                        id="session-audio-playback"
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
                {drillState === "analyzing" ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Running analysis...
                    </div>
                ) : null}
            </div>

            {drillState === "complete" ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {currentTranscript ? (
                        <TranscriptPanel transcript={currentTranscript} />
                    ) : (
                        <div className="rounded-xl border border-border/70 p-4">
                            <p className="text-sm font-medium">Transcript</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Waiting for transcription…
                            </p>
                        </div>
                    )}
                    {currentFeedback ? (
                        <FeedbackPanel feedbackMarkdown={currentFeedback} />
                    ) : (
                        <div className="rounded-xl border border-border/70 p-4">
                            <p className="text-sm font-medium">Feedback</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Waiting for feedback…
                            </p>
                        </div>
                    )}
                </div>
            ) : null}

            {authError ? (
                <p className="mt-4 text-xs text-destructive" role="alert">
                    {authError}
                </p>
            ) : null}
        </section>
    );
}
