"use client";

import { ArrowRight } from "lucide-react";

import { MockWaveform } from "@/components/onboarding/mock-waveform";
import { Button } from "@/components/ui/button";

interface PropsInterface {
    onNext: () => void;
}

export function WelcomeStep(props: Readonly<PropsInterface>) {
    const { onNext } = props;

    return (
        <div className="space-y-5">
            <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">
                    Let&apos;s set this up in under two minutes
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    A few questions and a short sample—that&apos;s it.
                </p>
            </div>
            <MockWaveform active className="opacity-90" />
            <Button className="w-full" size="lg" onClick={onNext}>
                Get started
                <ArrowRight />
            </Button>
        </div>
    );
}
