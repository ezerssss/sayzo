"use client";

import { ArrowLeft, ArrowRight, Loader2, Search } from "lucide-react";
import { useState } from "react";

import { VoiceInputBlock } from "@/components/onboarding/voice-input-block";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

type CompanyResearchResponse = {
    summary: string;
    guessedIndustry: string;
    confidence: "low" | "medium" | "high";
};

interface PropsInterface {
    employmentStatus: "employed" | "unemployed";
    wantsInterviewPractice: boolean;
    onWantsInterviewPracticeChange: (value: boolean) => void;
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
        employmentStatus,
        wantsInterviewPractice,
        onWantsInterviewPracticeChange,
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
    const [hasTargetCompany, setHasTargetCompany] = useState(
        companyName.trim().length > 0,
    );

    const runCompanyResearch = async () => {
        const trimmedName = companyName.trim();
        if (!trimmedName) {
            return;
        }
        setIsResearching(true);
        setResearchError(null);
        try {
            const data = await api
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

    const isEmployed = employmentStatus === "employed";
    const shouldShowCompanyFields = isEmployed || hasTargetCompany;
    const shouldShowResearchButton = isEmployed || hasTargetCompany;
    const shouldAskTargetRole =
        employmentStatus === "unemployed" ||
        lookupReviewed ||
        needsManualDescription;

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold tracking-tight">
                    {isEmployed
                        ? "Where do you work?"
                        : "What interview context should we use?"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {isEmployed
                        ? "We will quickly verify your company details, then ask about your role."
                        : "Start with the role you are interviewing for. Add a target company only if you have one."}
                </p>
            </div>

            {isEmployed ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-sm font-medium text-foreground">
                        Are you also preparing for interviews?
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                            type="button"
                            variant={wantsInterviewPractice ? "default" : "outline"}
                            onClick={() => onWantsInterviewPracticeChange(true)}
                        >
                            Yes, include interviews
                        </Button>
                        <Button
                            type="button"
                            variant={wantsInterviewPractice ? "outline" : "default"}
                            onClick={() => onWantsInterviewPracticeChange(false)}
                        >
                            No, workplace only
                        </Button>
                    </div>
                </div>
            ) : null}

            {employmentStatus === "unemployed" ? (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                        Do you have a target company?
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button
                            type="button"
                            variant={hasTargetCompany ? "default" : "outline"}
                            onClick={() => setHasTargetCompany(true)}
                        >
                            Yes, I have one
                        </Button>
                        <Button
                            type="button"
                            variant={hasTargetCompany === false ? "default" : "outline"}
                            onClick={() => {
                                setHasTargetCompany(false);
                                onCompanyNameChange("");
                                onCompanyUrlChange("");
                                onCompanyContextChange("");
                                setSummary("");
                                setGuessedIndustry("");
                                setConfidence("low");
                                setNeedsManualDescription(false);
                                setLookupReviewed(false);
                                setResearchError(null);
                            }}
                        >
                            No, target role only
                        </Button>
                    </div>
                </div>
            ) : null}

            {shouldShowCompanyFields ? (
                <>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                            {isEmployed
                                ? "Company / organization name"
                                : "Target company / organization"}
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
                            Company URL (optional)
                        </p>
                        <input
                            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                            placeholder="e.g. https://infisical.com"
                            value={companyUrl}
                            onChange={(e) => onCompanyUrlChange(e.target.value)}
                        />
                    </div>
                </>
            ) : null}

            {shouldShowCompanyFields ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                    {shouldShowResearchButton ? (
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
                    ) : null}

                    {summary ? (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">{summary}</p>
                            <p className="text-sm">
                                <span className="font-medium">Confidence:</span>{" "}
                                {confidence}
                            </p>
                            <p className="text-sm font-medium">
                                {isEmployed
                                    ? "Is this accurate?"
                                    : "Is this useful?"}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        lookupReviewed && needsManualDescription === false
                                            ? "default"
                                            : "outline"
                                    }
                                    onClick={() => {
                                        onCompanyContextChange(summary);
                                        setNeedsManualDescription(false);
                                        setLookupReviewed(true);
                                    }}
                                >
                                    Yes
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        lookupReviewed && needsManualDescription
                                            ? "default"
                                            : "outline"
                                    }
                                    onClick={() => {
                                        setLookupReviewed(true);
                                        setNeedsManualDescription(true);
                                    }}
                                >
                                    No
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
                                label={
                                    isEmployed
                                        ? "Tell us what your company does"
                                        : "Tell us about your target company or domain"
                                }
                                value={companyContext}
                                onChange={onCompanyContextChange}
                                placeholder={
                                    isEmployed
                                        ? "e.g. We build an enterprise secrets management platform."
                                        : "e.g. I am preparing for fintech support roles at SaaS companies."
                                }
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
            ) : null}

            {shouldAskTargetRole && (
                <VoiceInputBlock
                    label={
                        isEmployed
                            ? "What is your role there?"
                            : "What role are you interviewing for?"
                    }
                    value={workRoleContext}
                    onChange={onWorkRoleContextChange}
                    placeholder={
                        isEmployed
                            ? "e.g. I lead customer onboarding and enterprise implementation calls."
                            : "e.g. I am interviewing for a customer success manager role."
                    }
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
