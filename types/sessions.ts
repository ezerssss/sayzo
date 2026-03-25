export type ScenarioType = {
    title: string;
    situationContext: string;
    givenContent: string; // Specific details of the situation that are relevant to the session.
    task: string; // Clear, structured instructions for the given context
};

export type SessionPlanType = {
    scenario: ScenarioType;
    focus: string[]; // Behaviour constraints that the user should follow.
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
