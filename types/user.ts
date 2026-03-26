export type CompanyResearchType = {
    summary: string;
    guessedIndustry: string;
    keyProducts: string[];
    keyFeatures: string[];
    targetCustomers: string[];
    domainSignals: string[];
    supplementalFacts: string[];
    groundedFacts: string[];
    unknowns: string[];
    confidence: "low" | "medium" | "high";
    sources: string[];
    sourceEvidence: Array<{
        source: string;
        reliability: "high" | "medium" | "low";
        highlights: string[];
    }>;
    updatedAt: string;
};

export type UserProfileType = {
    uid: string;
    onboardingComplete: boolean;

    role: string;
    industry: string;
    companyName: string;
    companyUrl: string;
    companyDescription: string;
    workplaceCommunicationContext: string;
    motivation: string;

    goals: string[];
    additionalContext: string;
    companyResearch?: CompanyResearchType;

    createdAt: string;
    updatedAt: string;
};
