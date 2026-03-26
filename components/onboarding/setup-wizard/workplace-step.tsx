"use client";

import ky from "ky";
import { ArrowLeft, ArrowRight, Loader2, Search } from "lucide-react";
import { useState } from "react";

import { VoiceInputBlock } from "@/components/onboarding/voice-input-block";
import { Button } from "@/components/ui/button";
import { getKyErrorMessage } from "@/lib/ky-error-message";

type CompanyResearchResponse = {
    summary: string;
    guessedIndustry: string;
    confidence: "low" | "medium" | "high";
};

interface PropsInterface {
    companyName: string;
    onCompanyNameChange: (value: string) => void;
    companyUrl: string;
    onCompanyUrlChange: (value: string) => void;
    companyContext: string;
    onCompanyContextChange: (value: string) => void;
    workRoleContext: string;
    onWorkRoleContextChange: (value: string) => void;
    canContinue: boolean;
    onBack: () => void;
    onNext: () => void;
}

export function WorkplaceStep(props: Readonly<PropsInterface>) {
    const {
        companyName,
        onCompanyNameChange,
        companyUrl,
        onCompanyUrlChange,
        companyContext,
        onCompanyContextChange,
        workRoleContext,
        onWorkRoleContextChange,
        canContinue,
        onBack,
        onNext,
    } = props;

    const [summary, setSummary] = useState("");
    const [guessedIndustry, setGuessedIndustry] = useState("");
    const [confidence, setConfidence] = useState<"low" | "medium" | "high">(
        "low",
    );
    const [isResearching, setIsResearching] = useState(false);
    const [researchError, setResearchError] = useState<string | null>(null);
    const [needsManualDescription, setNeedsManualDescription] = useState(false);
    const [lookupReviewed, setLookupReviewed] = useState(false);

    const runCompanyResearch = async () => {
        const trimmedName = companyName.trim();
        if (!trimmedName) {
            return;
        }
        setIsResearching(true);
        setResearchError(null);
        try {
            const data = await ky
                .post("/api/onboarding/company-research", {
                    json: {
                        companyName: trimmedName,
                        companyUrl: companyUrl.trim(),
                    },
                    timeout: 210_000,
                })
                .json<CompanyResearchResponse>();
            setSummary(data.summary);
            setGuessedIndustry(data.guessedIndustry);
            setConfidence(data.confidence);
            setLookupReviewed(false);
            setNeedsManualDescription(false);
        } catch (error) {
            setResearchError(
                await getKyErrorMessage(
                    error,
                    "Could not look up that company right now.",
                ),
            );
        } finally {
            setIsResearching(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    Where do you work?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    We will verify your company context first, then ask your role.
                </p>
            </div>

            <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                    Company / organization name
                </p>
                <input
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    placeholder="e.g. Infisical, Google, ACME Logistics"
                    value={companyName}
                    onChange={(e) => onCompanyNameChange(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                    Company URL (optional but recommended)
                </p>
                <input
                    className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                    placeholder="e.g. https://infisical.com"
                    value={companyUrl}
                    onChange={(e) => onCompanyUrlChange(e.target.value)}
                />
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                <Button
                    type="button"
                    variant="outline"
                    disabled={isResearching || companyName.trim().length === 0}
                    onClick={() => void runCompanyResearch()}
                >
                    {isResearching ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            Looking it up...
                        </>
                    ) : (
                        <>
                            <Search className="size-4" />
                            Research company
                        </>
                    )}
                </Button>

                {summary ? (
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">{summary}</p>
                        <p className="text-sm">
                            <span className="font-medium">Confidence:</span>{" "}
                            {confidence}
                        </p>
                        <p className="text-sm font-medium">
                            Is this your company context?
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    onCompanyContextChange(summary);
                                    setNeedsManualDescription(false);
                                    setLookupReviewed(true);
                                }}
                            >
                                Yes, that is correct
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    setLookupReviewed(true);
                                    setNeedsManualDescription(true);
                                }}
                            >
                                No, not quite
                            </Button>
                        </div>
                    </div>
                ) : null}
                {guessedIndustry ? (
                    <p className="text-sm">
                        <span className="font-medium">Likely industry:</span>{" "}
                        {guessedIndustry}
                    </p>
                ) : null}
                {lookupReviewed && needsManualDescription ? (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void runCompanyResearch()}
                            >
                                Try searching again
                            </Button>
                        </div>
                        <VoiceInputBlock
                            label="Tell us what your company does"
                            value={companyContext}
                            onChange={onCompanyContextChange}
                            placeholder="e.g. We build an enterprise secrets management platform."
                            minRows={3}
                        />
                    </div>
                ) : null}
                {researchError ? (
                    <p className="text-sm text-destructive" role="alert">
                        {researchError}
                    </p>
                ) : null}
            </div>

            {(lookupReviewed || needsManualDescription) && (
                <VoiceInputBlock
                    label="What is your role there?"
                    value={workRoleContext}
                    onChange={onWorkRoleContextChange}
                    placeholder="e.g. I lead customer onboarding and enterprise implementation calls."
                    minRows={3}
                />
            )}

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
                    disabled={!canContinue}
                    onClick={onNext}
                >
                    Continue
                    <ArrowRight />
                </Button>
            </div>
        </div>
    );
}
