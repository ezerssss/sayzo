"use client";

import { CheckCircle2, Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import type { OnboardingSampleConfig } from "@/components/onboarding/setup-wizard/steps";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";

export type OnboardingSampleResult = {
    transcript: string;
    audio: Uint8Array;
    mimeType: string;
    filename: string;
};

const CONFIRM_SECONDS = 3;

// Countdown-ring geometry (SVG viewBox 100×100, drawn at -90° so it depletes
// from the top as the timer runs out).
const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

function extensionForMime(mime: string): string {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
    return "webm";
}

interface PropsInterface {
    sample: OnboardingSampleConfig;
    onNext: (result: OnboardingSampleResult) => void;
    onSkip: () => void;
}

export function OnboardingSampleStep(props: Readonly<PropsInterface>) {
    const { sample, onNext, onSkip } = props;
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const [secondsLeft, setSecondsLeft] = useState(sample.maxSeconds);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeError, setTranscribeError] = useState<string | null>(null);
    const [pendingResult, setPendingResult] =
        useState<OnboardingSampleResult | null>(null);
    const [confirmCountdown, setConfirmCountdown] = useState(CONFIRM_SECONDS);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const onNextRef = useRef(onNext);
    useEffect(() => {
        onNextRef.current = onNext;
    }, [onNext]);

    const clearTick = useCallback(() => {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    }, []);

    const handleStop = useCallback(async () => {
        clearTick();
        const result = await stop();
        if (!result?.blob.size) return;

        setTranscribeError(null);
        setIsTranscribing(true);
        try {
            const ext = extensionForMime(result.mimeType);
            const fd = new FormData();
            fd.append(
                "file",
                new File(
                    [result.blob],
                    `onboarding-${sample.sampleType}.${ext}`,
                    { type: result.mimeType },
                ),
            );
            const data = await api
                .post("/api/transcribe", {
                    body: fd,
                    timeout: 180_000,
                })
                .json<{ text?: string; error?: string }>();
            const text = (data.text ?? "").trim();
            if (!text) throw new Error("Transcription returned empty text.");

            const audio = new Uint8Array(await result.blob.arrayBuffer());
            setConfirmCountdown(CONFIRM_SECONDS);
            setPendingResult({
                transcript: text,
                audio,
                mimeType: result.mimeType,
                filename: `onboarding-${sample.sampleType}.${ext}`,
            });
        } catch (e) {
            setTranscribeError(
                await getKyErrorMessage(e, "Transcription failed."),
            );
        } finally {
            setIsTranscribing(false);
        }
    }, [clearTick, stop, sample.sampleType]);

    const stopRef = useRef(handleStop);
    useEffect(() => {
        stopRef.current = handleStop;
    }, [handleStop]);

    useEffect(() => {
        if (!isRecording) {
            clearTick();
            return;
        }
        tickRef.current = setInterval(() => {
            setSecondsLeft((s) => {
                if (s <= 1) {
                    clearTick();
                    void stopRef.current();
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return clearTick;
    }, [clearTick, isRecording]);

    useEffect(() => clearTick, [clearTick]);

    useEffect(() => {
        if (!pendingResult) return;
        const advanceId = setTimeout(() => {
            onNextRef.current(pendingResult);
        }, CONFIRM_SECONDS * 1000);
        const tickId = setInterval(() => {
            setConfirmCountdown((c) => {
                if (c <= 1) {
                    clearInterval(tickId);
                    return 0;
                }
                return c - 1;
            });
        }, 1000);
        return () => {
            clearTimeout(advanceId);
            clearInterval(tickId);
        };
    }, [pendingResult]);

    const handleCancel = useCallback(async () => {
        clearTick();
        await stop(); // discard the audio
        setSecondsLeft(sample.maxSeconds);
    }, [clearTick, stop, sample.maxSeconds]);

    const handleRedo = useCallback(async () => {
        setPendingResult(null);
        setConfirmCountdown(CONFIRM_SECONDS);
        setTranscribeError(null);
        setSecondsLeft(sample.maxSeconds);
        await start();
    }, [sample.maxSeconds, start]);

    const handleConfirmContinue = useCallback(() => {
        if (!pendingResult) return;
        onNext(pendingResult);
    }, [pendingResult, onNext]);

    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timerDisplay = `${minutes}:${secs.toString().padStart(2, "0")}`;

    const isConfirming = pendingResult !== null;
    const ringOffset =
        RING_C * (1 - (isRecording ? secondsLeft / sample.maxSeconds : 1));

    return (
        <div className="flex flex-col items-center text-center">
            <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight">
                    {sample.title}
                </h2>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {sample.subtitle}
                </p>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground/70">
                    {sample.hints.join("  ·  ")}
                </p>
            </div>

            {isConfirming ? (
                <div
                    className="mt-9 flex flex-col items-center gap-3"
                    role="status"
                    aria-live="polite"
                >
                    <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="size-8" />
                    </span>
                    <div>
                        <p className="text-base font-semibold text-foreground">
                            Got it
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {confirmCountdown > 0
                                ? `Finishing up in ${confirmCountdown}…`
                                : "Finishing up…"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            onClick={() => void handleRedo()}
                        >
                            <RotateCcw className="size-3.5" />
                            Redo
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleConfirmContinue}
                        >
                            Continue
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Voice orb — the focal control. Tap to start; tap again
                        to stop. While recording, a ring depletes as the timer
                        runs and a soft pulse signals it's live. */}
                    <div className="relative mt-10 flex size-44 items-center justify-center">
                        <div
                            aria-hidden
                            className={cn(
                                "absolute inset-3 rounded-full bg-gradient-to-br from-sky-400/30 to-indigo-500/30 blur-2xl",
                                !isRecording && "motion-safe:animate-pulse",
                            )}
                        />
                        {isRecording ? (
                            <span
                                aria-hidden
                                className="absolute inset-5 rounded-full bg-sky-400/15 motion-safe:animate-ping"
                            />
                        ) : null}
                        {isRecording ? (
                            <svg
                                aria-hidden
                                viewBox="0 0 100 100"
                                className="absolute inset-0 size-full -rotate-90"
                            >
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="46"
                                    fill="none"
                                    strokeWidth="2"
                                    className="stroke-sky-100"
                                />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="46"
                                    fill="none"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeDasharray={RING_C}
                                    strokeDashoffset={ringOffset}
                                    className="stroke-sky-500 transition-[stroke-dashoffset] duration-1000 ease-linear"
                                />
                            </svg>
                        ) : null}
                        <button
                            type="button"
                            aria-label={
                                isRecording
                                    ? "Stop recording"
                                    : "Start speaking"
                            }
                            disabled={isTranscribing}
                            onClick={() => {
                                if (isTranscribing) return;
                                if (isRecording) {
                                    void handleStop();
                                } else {
                                    setSecondsLeft(sample.maxSeconds);
                                    void start();
                                }
                            }}
                            className="relative flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-xl shadow-sky-600/30 ring-1 ring-inset ring-white/20 transition active:scale-95 disabled:opacity-70"
                        >
                            {isTranscribing ? (
                                <Loader2 className="size-9 animate-spin" />
                            ) : isRecording ? (
                                <Square className="size-8 fill-current" />
                            ) : (
                                <Mic className="size-9" />
                            )}
                        </button>
                    </div>

                    <div className="mt-6 flex min-h-[3.25rem] flex-col items-center justify-center gap-2.5">
                        {isRecording ? (
                            <>
                                <LiveWaveform
                                    stream={stream}
                                    active
                                    className="h-8 w-56"
                                />
                                <p className="font-mono text-sm tabular-nums text-muted-foreground">
                                    {timerDisplay}
                                    <span className="mx-2 text-muted-foreground/40">
                                        ·
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => void handleCancel()}
                                        className="font-sans underline-offset-2 hover:text-foreground hover:underline"
                                    >
                                        Cancel
                                    </button>
                                </p>
                            </>
                        ) : isTranscribing ? (
                            <p className="text-sm text-muted-foreground">
                                Transcribing your intro…
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Tap to start · up to a minute
                            </p>
                        )}
                    </div>

                    {transcribeError ? (
                        <p
                            className="mt-2 text-sm text-destructive"
                            role="alert"
                        >
                            {transcribeError}
                        </p>
                    ) : null}

                    {!isRecording && !isTranscribing ? (
                        <div className="mt-8 flex flex-col items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={onSkip}
                            >
                                Skip for now
                            </Button>
                            <p className="text-xs text-muted-foreground/70">
                                Sayzo also learns from your real conversations.
                            </p>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
