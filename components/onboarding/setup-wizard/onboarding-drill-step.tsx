"use client";

import ky from "ky";
import {
    ArrowLeft,
    ArrowRight,
    Loader2,
    Mic,
    RotateCcw,
    Sparkles,
    Square,
    X,
} from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import type { OnboardingDrillConfig } from "@/components/onboarding/setup-wizard/steps";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { getKyErrorMessage } from "@/lib/ky-error-message";

export type OnboardingDrillResult = {
    transcript: string;
    audio: Uint8Array;
    mimeType: string;
    filename: string;
};

function extensionForMime(mime: string): string {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
    return "webm";
}

interface PropsInterface {
    drill: OnboardingDrillConfig;
    drillIndex: number;
    totalDrills: number;
    onBack: () => void;
    onNext: (result: OnboardingDrillResult) => void;
    /** For the last drill, show "Finish" instead of "Next drill" */
    isLast?: boolean;
}

export function OnboardingDrillStep(props: Readonly<PropsInterface>) {
    const { drill, drillIndex, totalDrills, onBack, onNext, isLast } = props;
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const { user } = useAuthUser();
    const MAX_RECORDINGS = 3;
    const [recordingCount, setRecordingCount] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(drill.maxSeconds);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeError, setTranscribeError] = useState<string | null>(null);
    const [drillResult, setDrillResult] =
        useState<OnboardingDrillResult | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
            if (user?.uid) fd.append("uid", user.uid);
            fd.append(
                "file",
                new File(
                    [result.blob],
                    `onboarding-${drill.drillType}.${ext}`,
                    { type: result.mimeType },
                ),
            );
            const data = await ky
                .post("/api/transcribe", {
                    body: fd,
                    timeout: 180_000,
                })
                .json<{ text?: string; error?: string }>();
            const text = (data.text ?? "").trim();
            if (!text) throw new Error("Transcription returned empty text.");

            setRecordingCount((c) => c + 1);
            const audio = new Uint8Array(await result.blob.arrayBuffer());
            const drillRes: OnboardingDrillResult = {
                transcript: text,
                audio,
                mimeType: result.mimeType,
                filename: `onboarding-${drill.drillType}.${ext}`,
            };
            setDrillResult(drillRes);
        } catch (e) {
            setTranscribeError(
                await getKyErrorMessage(e, "Transcription failed."),
            );
        } finally {
            setIsTranscribing(false);
        }
    }, [clearTick, stop, drill.drillType, user?.uid]);

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

    const handleCancel = useCallback(async () => {
        clearTick();
        await stop(); // discard the audio
        setSecondsLeft(drill.maxSeconds);
    }, [clearTick, stop, drill.maxSeconds]);

    const handleReRecord = useCallback(async () => {
        setDrillResult(null);
        setTranscribeError(null);
        setSecondsLeft(drill.maxSeconds);
        await start();
    }, [drill.maxSeconds, start]);

    const hasResult = drillResult !== null;

    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const timerDisplay = `${minutes}:${secs.toString().padStart(2, "0")}`;

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                    Drill {drillIndex + 1} of {totalDrills}
                </p>
                <h2 className="text-lg font-semibold tracking-tight">
                    {drill.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {drill.prompt}
                </p>
            </div>

            {!hasResult ? (
                <>
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
                                        {hasResult
                                            ? "Re-record"
                                            : "Start speaking"}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </>
            ) : (
                <div className="space-y-4">
                    {/* Editable transcript */}
                    <div className="rounded-xl border border-border bg-muted/20 p-4">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Your response
                        </p>
                        <p className="mb-2 text-xs text-muted-foreground/70">
                            We&apos;ll use this to build your profile. Feel
                            free to edit, add details you missed, or correct
                            anything.
                        </p>
                        <textarea
                            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                            rows={Math.min(
                                10,
                                Math.max(
                                    3,
                                    Math.ceil(
                                        drillResult.transcript.length / 70,
                                    ),
                                ),
                            )}
                            value={drillResult.transcript}
                            onChange={(e) =>
                                setDrillResult((prev) =>
                                    prev
                                        ? {
                                              ...prev,
                                              transcript: e.target.value,
                                          }
                                        : prev,
                                )
                            }
                        />
                    </div>

                    {recordingCount < MAX_RECORDINGS ? (
                        <div className="flex flex-col items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 text-muted-foreground"
                                onClick={() => void handleReRecord()}
                            >
                                <RotateCcw className="size-3.5" />
                                Re-record ({MAX_RECORDINGS - recordingCount}{" "}
                                left)
                            </Button>
                        </div>
                    ) : null}
                </div>
            )}

            <div className="flex gap-2">
                {drillIndex > 0 ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={onBack}
                        disabled={isRecording || isTranscribing}
                    >
                        <ArrowLeft />
                        Back
                    </Button>
                ) : null}
                <Button
                    type="button"
                    className="flex-1"
                    disabled={!hasResult || isRecording || isTranscribing}
                    onClick={() => {
                        if (drillResult) onNext(drillResult);
                    }}
                >
                    {isLast ? (
                        <>
                            Finish setup
                            <Sparkles />
                        </>
                    ) : (
                        <>
                            Next drill
                            <ArrowRight />
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
