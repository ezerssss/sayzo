/** One emotion dimension from Hume (prosody / burst / language), after trimming. */
export type HumeTrimmedEmotion = {
    name: string;
    score: number;
};

export type HumeTimeRange = {
    begin: number;
    end: number;
};

/** Speech prosody segment — trimmed scores only. */
export type HumeProsodySegmentTrimmed = {
    text?: string;
    time: HumeTimeRange;
    emotions: HumeTrimmedEmotion[];
};

/** Vocal burst segment — trimmed emotions + descriptive features. */
export type HumeBurstSegmentTrimmed = {
    time: HumeTimeRange;
    emotions: HumeTrimmedEmotion[];
    descriptions: HumeTrimmedEmotion[];
};

/** Emotional language (text) segment — trimmed scores only. */
export type HumeLanguageSegmentTrimmed = {
    text: string;
    time?: HumeTimeRange;
    emotions: HumeTrimmedEmotion[];
};

/**
 * Compact view of Hume Expression Measurement for downstream LLM context.
 * Full raw payloads can be huge (48+48+53 dimensions per segment).
 */
export type HumeExpressionSummary = {
    prosody: HumeProsodySegmentTrimmed[];
    bursts: HumeBurstSegmentTrimmed[];
    language: HumeLanguageSegmentTrimmed[];
};

export type HumeExpressionTrimOptions = {
    /** Keep at most this many emotions per segment (after min-score filter). Default 8. */
    topEmotionsPerSegment?: number;
    /** Drop emotions below this score. Default 0.07. */
    minEmotionScore?: number;
    /** Burst nonverbal descriptors — max per burst. Default 5. */
    topBurstDescriptions?: number;
    minBurstDescriptionScore?: number;
    /** Batch job poll timeout (seconds). Default 600. */
    jobTimeoutSeconds?: number;
};
