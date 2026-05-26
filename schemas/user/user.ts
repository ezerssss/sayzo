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

/**
 * Minimal, schema-valid baseline profile for a user provisioned OUTSIDE the web
 * onboarding flow — i.e. a desktop-first user who signed in via the agent's
 * OAuth flow and never filled the questionnaire. Mirrors the `users/{uid}` doc
 * `onboarding/complete` seeds, with the questionnaire-derived fields set to
 * their "unknown" baselines (the questionnaire overwrites them later).
 *
 * NOTE: these fields ARE read by the analysis/planning pipeline (analyzer.ts,
 * planner.ts, focus-synthesizer.ts). The string fields degrade gracefully there
 * (`|| "(not set)"`). For `employmentStatus`/`wantsInterviewPractice` we use
 * `"employed"`/`false` deliberately because those are the exact defaults the
 * profile inferrer falls back to when the signal is unclear (see
 * profile-context-builder.ts:201-202), so an un-onboarded user reads identically
 * to an onboarded user whose drills gave no interview/employment signal. Drill
 * pre-generation is additionally gated on `onboardingComplete` (see
 * drill-pre-generator.ts), so the planner doesn't run on this empty profile at
 * all until the user onboards.
 *
 * Credit counters are deliberately UNSET so the defaults in
 * `lib/credits/server.ts` apply (used→0, limit→DEFAULT_FREE_CREDIT_LIMIT,
 * fullAccess→false). Used by `ensureUserProvisioned` (lib/user/provision.ts).
 */
export function createBaselineUserProfile(
    uid: string,
    now: string,
): UserProfileType {
    return {
        uid,
        onboardingComplete: false,
        onboardingStatus: "idle",
        employmentStatus: "employed",
        wantsInterviewPractice: false,
        role: "",
        industry: "",
        companyName: "",
        companyUrl: "",
        companyDescription: "",
        workplaceCommunicationContext: "",
        motivation: "",
        goals: [],
        additionalContext: "",
        createdAt: now,
        updatedAt: now,
    };
}
