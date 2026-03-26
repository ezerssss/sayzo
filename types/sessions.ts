export type ScenarioType = {
    title: string;
    situationContext: string;
    givenContent: string; // Specific details of the situation that are relevant to the session.
    framework: string; // Recommended speaking framework/structure for this context.
};

export type SessionPlanType = {
    scenario: ScenarioType;
    /** Primary user skill this drill aims to improve. */
    skillTarget: string;
    /** Maximum recording duration for this drill (seconds). */
    maxDurationSeconds: number;
};

export type SessionAnalysisType = {
    mainIssue: string;
    secondaryIssues: string[];
    improvements: string[];
    regressions: string[];
    notes: string;
};

export type SessionCompletionStatus =
    | "pending"
    | "passed"
    | "needs_retry";

export type SessionType = {
    id: string;
    uid: string;

    plan: SessionPlanType;

    audioUrl: string | null;
    transcript: string | null;

    analysis: SessionAnalysisType | null;
    feedback: string | null;
    completionStatus: SessionCompletionStatus;
    completionReason: string | null;
    processingStatus?: "idle" | "processing" | "failed";
    processingError?: string | null;
    processingUpdatedAt?: string;

    createdAt: string;
};
