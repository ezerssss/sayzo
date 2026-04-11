import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
} from "@/types/captures";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

const teachableMomentSchema = z.object({
    type: z.enum([
        "grammar",
        "filler",
        "phrasing",
        "vocabulary",
        "communication",
    ]),
    severity: z.enum(["minor", "moderate", "major"]),
    timestamp: z.number(),
    transcriptIdx: z.number(),
    userSaid: z.string(),
    suggestion: z.string(),
    explanation: z.string(),
});

const captureAnalysisSchema = z.object({
    serverTitle: z.string(),
    serverSummary: z.string(),
    teachableMoments: z.array(teachableMomentSchema),
    grammarPatterns: z.array(
        z.object({
            pattern: z.string(),
            frequency: z.number(),
            examples: z.array(
                z.object({ transcriptIdx: z.number(), text: z.string() }),
            ),
        }),
    ),
    vocabulary: z.object({
        uniqueWords: z.number(),
        sophisticationScore: z.number(),
        overusedSimpleWords: z.array(
            z.object({
                word: z.string(),
                count: z.number(),
                alternatives: z.array(z.string()),
            }),
        ),
        domainVocabulary: z.array(z.string()),
    }),
    fillerWords: z.object({
        totalCount: z.number(),
        perMinute: z.number(),
        breakdown: z.record(z.string(), z.number()),
        timestamps: z.array(z.number()),
    }),
    fluency: z.object({
        wordsPerMinute: z.number(),
        avgPauseDurationMs: z.number(),
        selfCorrections: z.number(),
        avgResponseLatencyMs: z.number(),
    }),
    communicationStyle: z.object({
        directness: z.number(),
        formality: z.number(),
        confidence: z.number(),
        turnTaking: z.enum(["balanced", "passive", "dominant"]),
    }),
});

type AnalysisResult = {
    serverTitle: string;
    serverSummary: string;
    analysis: CaptureAnalysis;
};

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "deep-analysis.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.CAPTURE_ANALYZER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function formatTranscript(transcript: CaptureTranscriptLine[]): string {
    return transcript
        .map(
            (line, idx) =>
                `[${idx}] [${line.start.toFixed(1)}s - ${line.end.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");
}

export async function analyzeCaptureDeep(
    transcript: CaptureTranscriptLine[],
    agentTitle: string,
    agentSummary: string,
    durationSecs: number,
): Promise<AnalysisResult> {
    const userLines = transcript.filter((l) => l.speaker === "user");
    const totalUserWords = userLines.reduce(
        (sum, l) => sum + l.text.split(/\s+/).length,
        0,
    );
    const userSpeakingMins =
        userLines.reduce((sum, l) => sum + (l.end - l.start), 0) / 60;

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(captureAnalysisSchema),
            name: "CaptureDeepAnalysis",
            description:
                "Deep analysis of a captured English conversation for coaching purposes.",
        }),
        system: readPrompt(),
        prompt: `## Agent-generated context
Title: ${agentTitle}
Summary: ${agentSummary}
Duration: ${Math.round(durationSecs)} seconds
User word count: ~${totalUserWords}
User speaking minutes: ~${userSpeakingMins.toFixed(1)}

## Full transcript (indexed)
${formatTranscript(transcript)}`,
        temperature: 0.15,
    });

    return {
        serverTitle: result.output.serverTitle,
        serverSummary: result.output.serverSummary,
        analysis: {
            teachableMoments: result.output.teachableMoments,
            grammarPatterns: result.output.grammarPatterns,
            vocabulary: result.output.vocabulary,
            fillerWords: result.output.fillerWords,
            fluency: result.output.fluency,
            communicationStyle: result.output.communicationStyle,
        },
    };
}
