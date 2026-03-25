"use client";

import { ArrowLeft, Mic, Sparkles, Square } from "lucide-react";
import { useState } from "react";

import { MockWaveform } from "@/components/onboarding/mock-waveform";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PropsInterface {
    canFinish: boolean;
    onBack: () => void;
    onFinish: () => void;
    onVoiceTakeComplete: () => void;
}

export function SampleStep(props: Readonly<PropsInterface>) {
    const { canFinish, onBack, onFinish, onVoiceTakeComplete } = props;

    const [mockSampleListening, setMockSampleListening] = useState(false);
    const [sampleSeconds, setSampleSeconds] = useState(30);

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
                    Practice timer (mock—tap the buttons to adjust)
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
                        −5s
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSampleSeconds(30)}
                    >
                        Reset
                    </Button>
                </div>
            </div>
            <MockWaveform active={mockSampleListening} />
            <div className="flex justify-center">
                <Button
                    type="button"
                    variant={mockSampleListening ? "secondary" : "outline"}
                    size="lg"
                    className="gap-2 rounded-full"
                    onClick={() => {
                        setMockSampleListening((wasListening) => {
                            if (wasListening) {
                                onVoiceTakeComplete();
                            }
                            return !wasListening;
                        });
                    }}
                >
                    {mockSampleListening ? (
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
