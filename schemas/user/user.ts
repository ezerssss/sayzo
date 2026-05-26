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

/**
 * Public-ish user profile + onboarding/credit state. Owner-readable
 * (firestore.rules).
 *
 * NOTE: the server-only coaching state that used to live here
 * (`internalLearnerContext`, `internalCaptureContext`,
 * `internalCaptureDeliveryNotes` + their cursors) has moved to the server-only
 * `learner-models/{uid}` doc (`LearnerModel.context.*`), so it no longer leaks
 * to the browser via this owner-readable doc.
 */
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
     * ISO timestamp of the user's first completed drill (any terminal status).
     * Drives the install-nudge cadence on the feedback page.
     */
    firstDrillCompletedAt?: string | null;

    createdAt: string;
    updatedAt: string;

    /**
     * Free-credit counters. Absent on pre-rollout docs — treat undefined as
     * 0 / default limit / false. A credit is charged on first record-attempt of
     * a drill, on capture upload, and on capture-replay creation. Secondary
     * endpoints (TTS, feedback-chat, transcribe) are gated by remaining credit
     * but don't charge (see lib/credits/server.ts).
     */
    creditsUsed?: number;
    creditsLimit?: number;
    hasFullAccess?: boolean;
    /** ISO timestamp of the last in-app access request. */
    accessRequestedAt?: string | null;
    /** Optional note the user submitted with their access request. */
    accessRequestNote?: string;
    /** ISO timestamp set by admin when full access is granted. */
    accessGrantedAt?: string | null;

    /**
     * Admin role flag. Server-checked on every admin endpoint via
     * `requireAdmin()` — never trust the client value.
     */
    isAdmin?: boolean;
};
