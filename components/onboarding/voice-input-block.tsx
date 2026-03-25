"use client";

import { Mic, Square } from "lucide-react";
import { useState } from "react";

import { MockWaveform } from "@/components/onboarding/mock-waveform";
import { Button } from "@/components/ui/button";
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
        helper = "Tap the mic to simulate voice (mock), or type your answer.",
        minRows = 3,
    } = props;

    const [mockListening, setMockListening] = useState(false);

    return (
        <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <MockWaveform active={mockListening} />
            <div className="flex justify-center">
                <Button
                    type="button"
                    variant={mockListening ? "secondary" : "outline"}
                    size="lg"
                    className="gap-2 rounded-full"
                    onClick={() => setMockListening((v) => !v)}
                >
                    {mockListening ? (
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
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
