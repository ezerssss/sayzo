import "server-only";

import { HumeClient } from "hume";

import type {
    HumeExpressionSummary,
    HumeExpressionTrimOptions,
    HumeLanguageSegmentTrimmed,
    HumeTrimmedEmotion,
} from "@/types/hume-expression";

/** Narrow shapes we read from Hume batch predictions (avoids deep SDK type paths). */
type HumeEmotionScore = { name: string; score: number };

type HumeProsodyPrediction = {
    text?: string;
    time: { begin: number; end: number };
    emotions: HumeEmotionScore[];
};

type HumeBurstPrediction = {
    time: { begin: number; end: number };
    emotions: HumeEmotionScore[];
    descriptions: HumeEmotionScore[];
};

type HumeLanguagePrediction = {
    text: string;
    time?: { begin: number; end: number };
    emotions: HumeEmotionScore[];
};

type HumeGrouped<T> = { predictions: T[] };

type HumeFileModels = {
    prosody?: { groupedPredictions?: HumeGrouped<HumeProsodyPrediction>[] };
    burst?: { groupedPredictions?: HumeGrouped<HumeBurstPrediction>[] };
    language?: { groupedPredictions?: HumeGrouped<HumeLanguagePrediction>[] };
};

type HumeInferenceFilePrediction = { models: HumeFileModels };

export type MeasureHumeExpressionInput = {
    /** Raw audio bytes (e.g. webm, mp3, wav). */
    audio: Uint8Array;
    /** Filename hint for Hume (affects format detection). */
    filename?: string;
    /** MIME type for upload (e.g. audio/webm). */
    contentType?: string;
    /** Session transcript — drives the Language (emotional language) model via batch `text`. */
    transcript: string;
};

const DEFAULT_TOP_EMOTIONS = 8;
const DEFAULT_MIN_EMOTION = 0.07;
const DEFAULT_TOP_BURST_DESC = 5;
const DEFAULT_MIN_BURST_DESC = 0.07;
const DEFAULT_JOB_TIMEOUT_S = 600;

function trimScores(
    scores: readonly { name: string; score: number }[],
    topK: number,
    minScore: number,
): HumeTrimmedEmotion[] {
    return [...scores]
        .filter((e) => e.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((e) => ({ name: e.name, score: e.score }));
}

function resolveTrimOptions(
    o?: HumeExpressionTrimOptions,
): Required<HumeExpressionTrimOptions> {
    return {
        topEmotionsPerSegment: o?.topEmotionsPerSegment ?? DEFAULT_TOP_EMOTIONS,
        minEmotionScore: o?.minEmotionScore ?? DEFAULT_MIN_EMOTION,
        topBurstDescriptions: o?.topBurstDescriptions ?? DEFAULT_TOP_BURST_DESC,
        minBurstDescriptionScore:
            o?.minBurstDescriptionScore ?? DEFAULT_MIN_BURST_DESC,
        jobTimeoutSeconds: o?.jobTimeoutSeconds ?? DEFAULT_JOB_TIMEOUT_S,
    };
}

function emptySummary(): HumeExpressionSummary {
    return { prosody: [], bursts: [], language: [] };
}

function appendProsody(
    out: HumeExpressionSummary,
    grouped: HumeGrouped<HumeProsodyPrediction>[],
    t: Required<HumeExpressionTrimOptions>,
): void {
    for (const group of grouped) {
        for (const p of group.predictions) {
            out.prosody.push({
                text: p.text,
                time: { begin: p.time.begin, end: p.time.end },
                emotions: trimScores(
                    p.emotions,
                    t.topEmotionsPerSegment,
                    t.minEmotionScore,
                ),
            });
        }
    }
}

function appendBursts(
    out: HumeExpressionSummary,
    grouped: HumeGrouped<HumeBurstPrediction>[],
    t: Required<HumeExpressionTrimOptions>,
): void {
    for (const group of grouped) {
        for (const p of group.predictions) {
            out.bursts.push({
                time: { begin: p.time.begin, end: p.time.end },
                emotions: trimScores(
                    p.emotions,
                    t.topEmotionsPerSegment,
                    t.minEmotionScore,
                ),
                descriptions: trimScores(
                    p.descriptions,
                    t.topBurstDescriptions,
                    t.minBurstDescriptionScore,
                ),
            });
        }
    }
}

function appendLanguage(
    out: HumeExpressionSummary,
    grouped: HumeGrouped<HumeLanguagePrediction>[],
    t: Required<HumeExpressionTrimOptions>,
): void {
    for (const group of grouped) {
        for (const p of group.predictions) {
            const seg: HumeLanguageSegmentTrimmed = {
                text: p.text,
                emotions: trimScores(
                    p.emotions,
                    t.topEmotionsPerSegment,
                    t.minEmotionScore,
                ),
            };
            if (p.time) {
                seg.time = { begin: p.time.begin, end: p.time.end };
            }
            out.language.push(seg);
        }
    }
}

function mergeFilePrediction(
    out: HumeExpressionSummary,
    filePrediction: HumeInferenceFilePrediction,
    t: Required<HumeExpressionTrimOptions>,
): void {
    const { models } = filePrediction;
    if (models.prosody?.groupedPredictions) {
        appendProsody(out, models.prosody.groupedPredictions, t);
    }
    if (models.burst?.groupedPredictions) {
        appendBursts(out, models.burst.groupedPredictions, t);
    }
    if (models.language?.groupedPredictions) {
        appendLanguage(out, models.language.groupedPredictions, t);
    }
}

function buildTrimmedFromPages(
    pages: Array<{ results?: { predictions?: HumeInferenceFilePrediction[] } }>,
    t: Required<HumeExpressionTrimOptions>,
): HumeExpressionSummary {
    const out = emptySummary();
    for (const page of pages) {
        const filePredictions = page.results?.predictions;
        if (!filePredictions?.length) {
            continue;
        }
        for (const filePrediction of filePredictions) {
            mergeFilePrediction(out, filePrediction, t);
        }
    }
    return out;
}

async function runHumeBatchJob(
    input: MeasureHumeExpressionInput,
    t: Required<HumeExpressionTrimOptions>,
): Promise<{
    jobId: string;
    pages: Array<{ results?: { predictions?: HumeInferenceFilePrediction[] } }>;
}> {
    const apiKey = process.env.HUME_API_KEY?.trim();
    if (!apiKey) {
        throw new Error(
            "Missing HUME_API_KEY. Add it to .env.local (see env.example).",
        );
    }

    const transcript = input.transcript.trim();
    if (!transcript) {
        throw new Error(
            "measureSessionExpression requires a non-empty transcript.",
        );
    }
    if (!input.audio.byteLength) {
        throw new Error("measureSessionExpression requires non-empty audio.");
    }

    const client = new HumeClient({ apiKey });

    const job =
        await client.expressionMeasurement.batch.startInferenceJobFromLocalFile({
            file: [
                {
                    data: input.audio,
                    filename: input.filename ?? "session.webm",
                    contentType: input.contentType ?? "application/octet-stream",
                },
            ],
            json: {
                models: {
                    prosody: { granularity: "utterance" },
                    burst: {},
                    language: { granularity: "sentence" },
                },
                text: [transcript],
            },
        });

    await job.awaitCompletion(t.jobTimeoutSeconds);

    const pages = (await client.expressionMeasurement.batch.getJobPredictions(
        job.jobId,
    )) as Array<{ results?: { predictions?: HumeInferenceFilePrediction[] } }>;

    return { jobId: job.jobId, pages };
}

/**
 * Runs Hume **batch** expression measurement on session audio:
 * - **prosody** (speech) + **burst** (vocal bursts) from the file
 * - **language** (emotional language) from `transcript` via batch `text`
 *
 * Returns a **trimmed** summary so analyzer prompts stay small.
 */
export async function measureSessionExpression(
    input: MeasureHumeExpressionInput,
    trimOptions?: HumeExpressionTrimOptions,
): Promise<HumeExpressionSummary> {
    const t = resolveTrimOptions(trimOptions);
    const { pages } = await runHumeBatchJob(input, t);
    return buildTrimmedFromPages(pages, t);
}

/** Serialize trimmed summary for LLM context (JSON string). */
export function humeSummaryToContextJson(summary: HumeExpressionSummary): string {
    return JSON.stringify(summary);
}
