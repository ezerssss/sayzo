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
    overview: string;
    mainIssue: string;
    secondaryIssues: string[];
    structureAndFlow: string[];
    clarityAndConciseness: string[];
    relevanceAndFocus: string[];
    engagement: string[];
    professionalism: string[];
    voiceToneExpression: string[];
    improvements: string[];
    regressions: string[];
    notes: string;
};

export type SessionFeedbackType = {
    overview: string;
    momentsToTighten: string;
    structureAndFlow: string;
    clarityAndConciseness: string;
    relevanceAndFocus: string;
    engagement: string;
    professionalism: string;
    deliveryAndProsody: string;
    betterOptions: string | null;
    nextRepetition: string;
    whatWorkedWell: string | null;
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
    audioObjectPath?: string | null;
    transcript: string | null;

    analysis: SessionAnalysisType | null;
    feedback: SessionFeedbackType | null;
    completionStatus: SessionCompletionStatus;
    completionReason: string | null;
    processingStatus?: "idle" | "processing" | "failed";
    processingStage?:
        | "starting"
        | "transcribing"
        | "uploading"
        | "analyzing_expression"
        | "analyzing"
        | "combining"
        | null;
    processingJobId?: string | null;
    processingError?: string | null;
    processingUpdatedAt?: string;

    createdAt: string;
};
