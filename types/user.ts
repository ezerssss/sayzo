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

export type OnboardingDrillProgress = {
    drillType: "self_introduction" | "workplace_scenario" | "challenge_moment";
    transcript: string;
    completedAt: string;
};

export type UserProfileType = {
    uid: string;
    onboardingComplete: boolean;
    onboardingStatus?: "idle" | "processing" | "failed" | "completed";
    onboardingError?: string | null;
    onboardingJobUpdatedAt?: string;
    /** Drill transcripts saved progressively during onboarding. */
    onboardingDrills?: OnboardingDrillProgress[];
    employmentStatus: "employed" | "unemployed";
    wantsInterviewPractice: boolean;

    role: string;
    industry: string;
    companyName: string;
    companyUrl: string;
    companyDescription: string;
    workplaceCommunicationContext: string;
    motivation: string;

    goals: string[];
    additionalContext: string;
    companyResearch?: CompanyResearchType | null;

    /**
     * Server-only bullet notes merged from drill transcripts over time.
     * Never shown in the app; used to personalize future drill plans. Empty string when none.
     */
    internalLearnerContext: string;
    /** Idempotency: last session id merged into `internalLearnerContext`; empty string if never updated. */
    lastInternalLearnerContextSessionId: string;

    /**
     * Server-only bullet notes from optional skip / post-drill reflection signals (voice or text).
     * Separate from `internalLearnerContext` (which is transcript-derived professional grounding).
     */
    internalDrillSignalNotes: string;
    /** Idempotency: last session id merged into `internalDrillSignalNotes`; empty string if never updated. */
    lastDrillSignalNotesSessionId: string;

    /**
     * Server-only bullet notes derived from real conversation captures (mic + system audio).
     * Distinct from `internalLearnerContext` (drill-derived) because real conversations show
     * how the user actually communicates in their work — who they talk to, what topics, what
     * formality level, what context they bring up unprompted. Drives drill personalization.
     * Empty string when no captures have been processed yet.
     */
    internalCaptureContext?: string;
    /**
     * Server-only bullet notes about HOW the user speaks in real conversations (prosody, pace,
     * tone, vocal patterns, delivery habits). Sourced from Hume signals + transcript analysis
     * during capture processing. Drills can't reliably surface these because they're short and
     * rehearsed; real captures show the user's actual delivery baseline.
     * Empty string when no captures have been processed yet.
     */
    internalCaptureDeliveryNotes?: string;
    /** Idempotency: last capture id merged into the capture context fields; empty string if never updated. */
    lastInternalCaptureContextCaptureId?: string;

    createdAt: string;
    updatedAt: string;
};
