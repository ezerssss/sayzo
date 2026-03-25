"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";

interface PropsInterface {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    helper?: string;
    minRows?: number;
}

export function VoiceInputBlock(props: Readonly<PropsInterface>) {
    const {
        label,
        value,
        onChange,
        placeholder,
        helper = "Tap the mic to record and transcribe, or type your answer.",
        minRows = 3,
    } = props;

    const {
        isRecording,
        stream,
        error,
        start,
        stop,
        clearError,
    } = useVoiceRecorder();
    const [transcribeError, setTranscribeError] = useState<string | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);

    const transcribe = useCallback(
        async (blob: Blob, mimeType: string) => {
            setTranscribeError(null);
            setIsTranscribing(true);
            try {
                const fd = new FormData();
                fd.append(
                    "file",
                    new File([blob], "voice-input.webm", { type: mimeType }),
                );
                const res = await fetch("/api/transcribe", {
                    method: "POST",
                    body: fd,
                });
                const data = (await res.json()) as {
                    text?: string;
                    error?: string;
                    detail?: string;
                };
                if (!res.ok) {
                    throw new Error(
                        data.error ??
                            data.detail ??
                            "Transcription request failed.",
                    );
                }
                const nextText = data.text?.trim();
                if (nextText) {
                    onChange(nextText);
                }
            } catch (e) {
                setTranscribeError(
                    e instanceof Error ? e.message : "Transcription failed.",
                );
            } finally {
                setIsTranscribing(false);
            }
        },
        [onChange],
    );

    const onToggleRecording = useCallback(async () => {
        clearError();
        setTranscribeError(null);
        if (isRecording) {
            const result = await stop();
            if (result?.blob.size) {
                void transcribe(result.blob, result.mimeType);
            }
            return;
        }
        await start();
    }, [clearError, isRecording, start, stop, transcribe]);

    let buttonLabel: ReactNode;
    if (isTranscribing) {
        buttonLabel = (
            <>
                <Loader2 className="size-4 animate-spin" />
                Transcribing...
            </>
        );
    } else if (isRecording) {
        buttonLabel = (
            <>
                <Square className="size-4 fill-current" />
                Stop
            </>
        );
    } else {
        buttonLabel = (
            <>
                <Mic />
                Speak
            </>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <LiveWaveform stream={stream} active={isRecording} />
            <div className="flex justify-center">
                <Button
                    type="button"
                    variant={isRecording ? "secondary" : "outline"}
                    size="lg"
                    className="gap-2 rounded-full"
                    disabled={isTranscribing}
                    onClick={() => void onToggleRecording()}
                >
                    {buttonLabel}
                </Button>
            </div>
            {(error || transcribeError) && (
                <p className="text-center text-xs text-destructive" role="alert">
                    {error ?? transcribeError}
                </p>
            )}
            {helper ? (
                <p className="text-center text-xs text-muted-foreground">
                    {helper}
                </p>
            ) : null}
            <textarea
                className={cn(
                    "w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm",
                    "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                    "outline-none",
                )}
                rows={minRows}
                placeholder={placeholder}
                value={value}
                disabled={isRecording}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
