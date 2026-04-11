export type CaptureTranscriptLine = {
    speaker: string; // "user", "other_1", "other_2", "other_unmic", etc.
    start: number; // seconds into conversation
    end: number;
    text: string;
};

export type CaptureStatus =
    | "queued"
    | "transcribing"
    | "transcribed"
    | "validating"
    | "validated"
    | "rejected"
    | "analyzing"
    | "profiling"
    | "analyzed"
    | "transcribe_failed"
    | "validate_failed"
    | "analyze_failed"
    | "profile_failed";

export type CaptureCloseReason = "joint_silence" | "safety_cap" | "shutdown";

export type TeachableMomentType =
    | "grammar"
    | "filler"
    | "phrasing"
    | "vocabulary"
    | "communication";

export type TeachableMomentSeverity = "minor" | "moderate" | "major";

export type TeachableMoment = {
    type: TeachableMomentType;
    severity: TeachableMomentSeverity;
    timestamp: number;
    transcriptIdx: number;
    userSaid: string;
    suggestion: string;
    explanation: string;
};

export type GrammarPattern = {
    pattern: string;
    frequency: number;
    examples: { transcriptIdx: number; text: string }[];
};

export type VocabularyAssessment = {
    uniqueWords: number;
    sophisticationScore: number;
    overusedSimpleWords: {
        word: string;
        count: number;
        alternatives: string[];
    }[];
    domainVocabulary: string[];
};

export type FillerWordAnalysis = {
    totalCount: number;
    perMinute: number;
    breakdown: Record<string, number>;
    timestamps: number[];
};

export type FluencyMetrics = {
    wordsPerMinute: number;
    avgPauseDurationMs: number;
    selfCorrections: number;
    avgResponseLatencyMs: number;
};

export type CommunicationStyle = {
    directness: number; // 0-1
    formality: number; // 0-1
    confidence: number; // 0-1
    turnTaking: "balanced" | "passive" | "dominant";
};

export type CaptureAnalysis = {
    teachableMoments: TeachableMoment[];
    grammarPatterns: GrammarPattern[];
    vocabulary: VocabularyAssessment;
    fillerWords: FillerWordAnalysis;
    fluency: FluencyMetrics;
    communicationStyle: CommunicationStyle;
};

export type CaptureType = {
    uid: string;

    status: CaptureStatus;
    rejectionReason: string | null;
    uploadedAt: string;
    error?: string | null;
    retryCount?: number;

    agentRecordId: string;
    startedAt: string;
    endedAt: string;
    title: string;
    summary: string;
    agentTranscript: CaptureTranscriptLine[];
    relevantSpan: [number, number];
    closeReason: CaptureCloseReason;
    audioStoragePath: string;

    serverTranscript?: CaptureTranscriptLine[];
    serverTitle?: string;
    serverSummary?: string;
    durationSecs?: number;

    analysis?: CaptureAnalysis;
};
