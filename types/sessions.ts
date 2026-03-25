export type SessionAnalysisType = {
    issues: string[];
    improvements: string[];
};

export type SessionType = {
    id: string;
    uid: string;

    audioUrl: string;
    transcript: string;

    analysis: SessionAnalysisType;

    createdAt: string;
};
