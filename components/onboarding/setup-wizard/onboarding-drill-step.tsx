"use client";

import {
    ArrowLeft,
    CheckCircle2,
    Loader2,
    Mic,
    RotateCcw,
    Square,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import type { OnboardingDrillConfig } from "@/components/onboarding/setup-wizard/steps";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

export type OnboardingDrillResult = {
    transcript: string;
    audio: Uint8Array;
    mimeType: string;
    filename: string;
};

const CONFIRM_SECONDS = 3;

function extensionForMime(mime: string): string {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
    return "webm";
}

interface PropsInterface {
    drill: OnboardingDrillConfig;
    drillIndex: number;
    onBack: () => void;
    onNext: (result: OnboardingDrillResult) => void;
    onSkip: () => void;
    /** For the last drill, show "finish" wording on the skip button */
    isLast?: boolean;
}

export function OnboardingDrillStep(props: Readonly<PropsInterface>) {
    const { drill, drillIndex, onBack, onNext, onSkip, isLast } = props;
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const [secondsLeft, setSecondsLeft] = useState(drill.maxSeconds);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeError, setTranscribeError] = useState<string | null>(null);
    const [pendingResult, setPendingResult] =
        useState<OnboardingDrillResult | null>(null);
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
                    `onboarding-${drill.drillType}.${ext}`,
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
                filename: `onboarding-${drill.drillType}.${ext}`,
            });
        } catch (e) {
            setTranscribeError(
                await getKyErrorMessage(e, "Transcription failed."),
            );
        } finally {
            setIsTranscribing(false);
        }
    }, [clearTick, stop, drill.drillType]);

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
        setSecondsLeft(drill.maxSeconds);
    }, [clearTick, stop, drill.maxSeconds]);

    const handleRedo = useCallback(async () => {
        setPendingResult(null);
        setConfirmCountdown(CONFIRM_SECONDS);
        setTranscribeError(null);
        setSecondsLeft(drill.maxSeconds);
        await start();
    }, [drill.maxSeconds, start]);

    const handleConfirmContinue = useCallback(() => {
        if (!pendingResult) return;
        onNext(pendingResult);
    }, [pendingResult, onNext]);

    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timerDisplay = `${minutes}:${secs.toString().padStart(2, "0")}`;

    const isConfirming = pendingResult !== null;

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                    {drill.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {drill.prompt}
                </p>
            </div>

            {isConfirming ? (
                <div
                    className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 py-8"
                    role="status"
                    aria-live="polite"
                >
                    <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle2 className="size-5" />
                        <p className="text-base font-semibold">Got it</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {confirmCountdown > 0
                            ? `Moving on in ${confirmCountdown}…`
                            : "Moving on…"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-muted-foreground hover:text-foreground"
                            onClick={() => void handleRedo()}
                        >
                            <RotateCcw className="size-3.5" />
                            Redo this take
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            onClick={handleConfirmContinue}
                        >
                            Continue now
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        Sharing more here means a better-tailored plan. You can
                        skip — missing details fill in from your drills and
                        captures over time.
                    </p>
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-6">
                        <p
                            className="font-mono text-3xl font-semibold tabular-nums tracking-tight"
                            aria-live="polite"
                        >
                            {timerDisplay}
                        </p>
                        <p className="mt-1 text-center text-xs text-muted-foreground">
                            {isRecording
                                ? "Recording… stops automatically at 0:00"
                                : drill.helper}
                        </p>
                    </div>
                    <LiveWaveform stream={stream} active={isRecording} />
                    {transcribeError ? (
                        <p
                            className="text-center text-sm text-destructive"
                            role="alert"
                        >
                            {transcribeError}
                        </p>
                    ) : null}
                    <div className="flex items-center justify-center gap-3">
                        {isRecording ? (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="lg"
                                    className="gap-2 rounded-full text-muted-foreground"
                                    onClick={() => void handleCancel()}
                                >
                                    <X className="size-4" />
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="lg"
                                    className="gap-2 rounded-full"
                                    onClick={() => void handleStop()}
                                >
                                    <Square className="size-4 fill-current" />
                                    Done
                                </Button>
                            </>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="lg"
                                className="gap-2 rounded-full"
                                disabled={isTranscribing}
                                onClick={async () => {
                                    setSecondsLeft(drill.maxSeconds);
                                    await start();
                                }}
                            >
                                {isTranscribing ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" />
                                        Transcribing…
                                    </>
                                ) : (
                                    <>
                                        <Mic />
                                        Start speaking
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                    {!isRecording && !isTranscribing ? (
                        <div className="flex justify-center gap-3">
                            {drillIndex > 0 ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1 text-muted-foreground hover:text-foreground"
                                    onClick={onBack}
                                >
                                    <ArrowLeft className="size-3.5" />
                                    Back
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-muted-foreground hover:text-foreground"
                                onClick={onSkip}
                            >
                                {isLast ? "Skip and finish" : "Skip this drill"}
                            </Button>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}
