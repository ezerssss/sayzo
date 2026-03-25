export type SessionPlanType = {
    scenario: string;
    goals: string[];
    focus: string[];
};

export type SessionAnalysisType = {
    mainIssue: string;
    secondaryIssues: string[];
    improvements: string[];
    regressions: string[];
    notes: string;
};

export type SessionType = {
    id: string;
    uid: string;

    plan: SessionPlanType;

    audioUrl: string | null;
    transcript: string | null;

    analysis: SessionAnalysisType | null;
    feedback: string | null;

    createdAt: string;
};
