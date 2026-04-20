"use client";

import { ArrowLeft, Loader2, Mic, Sparkles, Square } from "lucide-react";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";

const MAX_SECONDS = 30;

export type IntroSamplePayload = {
    transcript: string;
    audio: Uint8Array;
    mimeType: string;
    filename: string;
};

function extensionForMime(mime: string): string {
    if (mime.includes("webm")) {
        return "webm";
    }
    if (mime.includes("mp4") || mime.includes("m4a")) {
        return "m4a";
    }
    return "webm";
}

interface PropsInterface {
    canFinish: boolean;
    onBack: () => void;
    onFinish: () => void | Promise<void>;
    onIntroReady: (payload: IntroSamplePayload) => void;
    /** Called when the user starts a new recording so a previous intro is discarded. */
    onIntroClear?: () => void;
}

export function SampleStep(props: Readonly<PropsInterface>) {
    const { canFinish, onBack, onFinish, onIntroReady, onIntroClear } = props;
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const [sampleSeconds, setSampleSeconds] = useState(MAX_SECONDS);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcribeError, setTranscribeError] = useState<string | null>(null);
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
        if (!result?.blob.size) {
            return;
        }
        setTranscribeError(null);
        setIsTranscribing(true);
        try {
            const ext = extensionForMime(result.mimeType);
            const fd = new FormData();
            fd.append(
                "file",
                new File([result.blob], `intro.${ext}`, {
                    type: result.mimeType,
                }),
            );
            const data = await api
                .post("/api/transcribe", {
                    body: fd,
                    timeout: 180_000,
                })
                .json<{
                text?: string;
                error?: string;
                detail?: string;
            }>();
            const transcript = (data.text ?? "").trim();
            if (!transcript) {
                throw new Error("Transcription returned empty text.");
            }
            const audio = new Uint8Array(await result.blob.arrayBuffer());
            onIntroReady({
                transcript,
                audio,
                mimeType: result.mimeType,
                filename: `intro.${ext}`,
            });
        } catch (e) {
            setTranscribeError(await getKyErrorMessage(e, "Transcription failed."));
        } finally {
            setIsTranscribing(false);
        }
    }, [clearTick, onIntroReady, stop]);

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
            setSampleSeconds((s) => {
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

    let timerHint: string;
    if (isTranscribing) {
        timerHint = "Turning your intro into text…";
    } else if (isRecording) {
        timerHint = "Recording... stops automatically at 0:00";
    } else if (canFinish) {
        timerHint = "Intro captured. Re-record only if you want a new take.";
    } else {
        timerHint = "Tap the button to start recording";
    }

    let recordButtonInner: ReactNode;
    if (isTranscribing) {
        recordButtonInner = (
            <>
                <Loader2 className="size-4 animate-spin" />
                Transcribing…
            </>
        );
    } else if (isRecording) {
        recordButtonInner = (
            <>
                <Square className="size-4 fill-current" />
                Stop
            </>
        );
    } else {
        recordButtonInner = (
            <>
                <Mic />
                Speak
            </>
        );
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    Quick 30-second intro
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Just introduce yourself. No pressure—say whatever feels
                    natural.
                </p>
            </div>
            <div
                className={cn(
                    "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-8",
                )}
            >
                <p
                    className="font-mono text-4xl font-semibold tabular-nums tracking-tight"
                    aria-live="polite"
                >
                    0:{sampleSeconds.toString().padStart(2, "0")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{timerHint}</p>
                <div className="mt-4 flex gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            setSampleSeconds((s) => Math.max(0, s - 5))
                        }
                    >
                        -5s
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSampleSeconds(MAX_SECONDS)}
                    >
                        Reset
                    </Button>
                </div>
            </div>
            <LiveWaveform stream={stream} active={isRecording} />
            {transcribeError ? (
                <p className="text-center text-sm text-destructive" role="alert">
                    {transcribeError}
                </p>
            ) : null}
            <div className="flex justify-center">
                <Button
                    type="button"
                    variant={isRecording ? "secondary" : "outline"}
                    size="lg"
                    className="gap-2 rounded-full"
                    disabled={isTranscribing || (!isRecording && canFinish)}
                    onClick={async () => {
                        if (isRecording) {
                            await handleStop();
                            return;
                        }
                        onIntroClear?.();
                        setSampleSeconds(MAX_SECONDS);
                        await start();
                    }}
                >
                    {recordButtonInner}
                </Button>
            </div>
            {canFinish && !isRecording && !isTranscribing ? (
                <div className="flex justify-center">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                            onIntroClear?.();
                            setTranscribeError(null);
                            setSampleSeconds(MAX_SECONDS);
                            await start();
                        }}
                    >
                        <Mic />
                        Re-record intro
                    </Button>
                </div>
            ) : null}
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={onBack}
                >
                    <ArrowLeft />
                    Back
                </Button>
                <Button
                    type="button"
                    className="flex-1"
                    disabled={!canFinish || isTranscribing}
                    onClick={() => void onFinish()}
                >
                    Finish setup
                    <Sparkles />
                </Button>
            </div>
        </div>
    );
}
