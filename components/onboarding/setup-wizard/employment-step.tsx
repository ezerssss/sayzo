"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PropsInterface {
    employmentStatus: "employed" | "unemployed";
    onEmploymentStatusChange: (value: "employed" | "unemployed") => void;
    onBack: () => void;
    onNext: () => void;
}

export function EmploymentStep(props: Readonly<PropsInterface>) {
    const {
        employmentStatus,
        onEmploymentStatusChange,
        onBack,
        onNext,
    } = props;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    What is your current employment status?
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    This helps us adapt practice scenarios for workplace communication
                    or interview preparation.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                    type="button"
                    variant={employmentStatus === "employed" ? "default" : "outline"}
                    onClick={() => onEmploymentStatusChange("employed")}
                >
                    Employed
                </Button>
                <Button
                    type="button"
                    variant={employmentStatus === "unemployed" ? "default" : "outline"}
                    onClick={() => onEmploymentStatusChange("unemployed")}
                >
                    Unemployed / Job seeking
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
                    onClick={onNext}
                >
                    Continue
                    <ArrowRight />
                </Button>
            </div>
        </div>
    );
}
