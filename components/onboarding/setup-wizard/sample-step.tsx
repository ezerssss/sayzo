"use client";

import { ArrowLeft, Mic, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";

const MAX_SECONDS = 30;

interface PropsInterface {
    canFinish: boolean;
    onBack: () => void;
    onFinish: () => void;
    onVoiceTakeComplete: () => void;
}

export function SampleStep(props: Readonly<PropsInterface>) {
    const { canFinish, onBack, onFinish, onVoiceTakeComplete } = props;
    const { isRecording, stream, start, stop } = useVoiceRecorder();
    const [sampleSeconds, setSampleSeconds] = useState(MAX_SECONDS);
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
        if (result?.blob.size) {
            onVoiceTakeComplete();
        }
    }, [clearTick, onVoiceTakeComplete, stop]);

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
                <p className="mt-1 text-xs text-muted-foreground">
                    {isRecording
                        ? "Recording... stops automatically at 0:00"
                        : "Tap the button to start recording"}
                </p>
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
            <div className="flex justify-center">
                <Button
                    type="button"
                    variant={isRecording ? "secondary" : "outline"}
                    size="lg"
                    className="gap-2 rounded-full"
                    onClick={async () => {
                        if (isRecording) {
                            await handleStop();
                            return;
                        }
                        setSampleSeconds(MAX_SECONDS);
                        await start();
                    }}
                >
                    {isRecording ? (
                        <>
                            <Square className="size-4 fill-current" />
                            Stop
                        </>
                    ) : (
                        <>
                            <Mic />
                            Speak
                        </>
                    )}
                </Button>
            </div>
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
                    disabled={!canFinish}
                    onClick={onFinish}
                >
                    Finish setup
                    <Sparkles />
                </Button>
            </div>
        </div>
    );
}
