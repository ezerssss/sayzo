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
import type { HumeExpressionSummary } from "@/types/hume-expression";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

// The unified four-part teachable shape used for every coaching moment
// (`teachableMoments` and dimensional `findings`). See `CoachingMoment` in
// `types/captures.ts` for the rationale.
const coachingMomentSchema = z.object({
    anchor: z.string(),
    whyIssue: z.string(),
    betterOption: z.string(),
    keyTakeaway: z.string(),
});

const teachableMomentSchema = coachingMomentSchema.extend({
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
});

const nativeSpeakerRewriteSchema = z.object({
    transcriptIdx: z.number(),
    original: z.string(),
    rewrite: z.string(),
    note: z.string(),
});

const dimensionalAnalysisSchema = z.object({
    assessment: z.string(),
    findings: z.array(coachingMomentSchema),
});

const captureAnalysisSchema = z.object({
    serverTitle: z.string(),
    serverSummary: z.string(),

    overview: z.string(),
    mainIssue: z.string(),
    secondaryIssues: z.array(z.string()),
    notes: z.string(),

    structureAndFlow: dimensionalAnalysisSchema,
    clarityAndConciseness: dimensionalAnalysisSchema,
    relevanceAndFocus: dimensionalAnalysisSchema,
    engagement: dimensionalAnalysisSchema,
    professionalism: dimensionalAnalysisSchema,
    voiceToneExpression: dimensionalAnalysisSchema,

    improvements: z.array(z.string()),
    regressions: z.array(z.string()),

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
        breakdown: z.array(
            z.object({ word: z.string(), count: z.number() }),
        ),
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

    nativeSpeakerRewrites: z.array(nativeSpeakerRewriteSchema),

    nativeSpeakerVersion: z.string().nullable(),
});

type AnalysisResult = {
    serverTitle: string;
    serverSummary: string;
    analysis: CaptureAnalysis;
};

export type CaptureAnalyzerInput = {
    transcript: CaptureTranscriptLine[];
    agentTitle: string;
    agentSummary: string;
    durationSecs: number;
    /** Trimmed Hume payload — passed verbatim to the LLM as delivery evidence. */
    humeExpression: HumeExpressionSummary | null;
    /** User profile context so analysis is calibrated to role/industry/communication context. */
    userProfile: Pick<
        UserProfileType,
        | "role"
        | "industry"
        | "companyName"
        | "companyDescription"
        | "workplaceCommunicationContext"
        | "motivation"
        | "goals"
        | "additionalContext"
    >;
    /** Existing skill memory so the LLM can flag improvements/regressions. */
    skillMemory: Pick<
        SkillMemoryType,
        "strengths" | "weaknesses" | "masteredFocus" | "reinforcementFocus"
    >;
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
    input: CaptureAnalyzerInput,
): Promise<AnalysisResult> {
    const {
        transcript,
        agentTitle,
        agentSummary,
        durationSecs,
        humeExpression,
        userProfile,
        skillMemory,
    } = input;

    const userLines = transcript.filter((l) => l.speaker === "user");
    const totalUserWords = userLines.reduce(
        (sum, l) => sum + l.text.split(/\s+/).length,
        0,
    );
    const userSpeakingMins =
        userLines.reduce((sum, l) => sum + (l.end - l.start), 0) / 60;

    const humePayload = humeExpression
        ? JSON.stringify(humeExpression)
        : "(Hume measurement unavailable for this capture — base voiceToneExpression on transcript pacing/disfluency cues only and say so in `notes`.)";

    const prompt = `## User profile (for calibration)
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Company description: ${userProfile.companyDescription || "(not set)"}
- Workplace communication context: ${userProfile.workplaceCommunicationContext || "(not set)"}
- Motivation: ${userProfile.motivation || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Existing skill memory (use to flag improvements / regressions)
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${skillMemory.masteredFocus.length ? skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${skillMemory.reinforcementFocus.length ? skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Capture context (from the desktop agent's small local LLM — may contain errors)
Agent-generated title (UNRELIABLE — may misidentify speakers or use wrong names): ${agentTitle}
Agent-generated summary (UNRELIABLE — may attribute the user's actions to other speakers): ${agentSummary}
Duration: ${Math.round(durationSecs)} seconds
User word count: ~${totalUserWords}
User speaking minutes: ~${userSpeakingMins.toFixed(1)}

## Full transcript (indexed, speaker-tagged — THIS is the source of truth)
The "user" speaker is the learner. ALL other speakers (other_1, other_2, etc.) are not the learner. Base ALL coaching, ALL facts, and ALL identity on the transcript speaker labels — NOT on the agent title/summary above which may have gotten the identity wrong.
${formatTranscript(transcript)}

## Hume AI signals (USER-ONLY across all three models: prosody + bursts from the user's mic channel only, language from user-only text)
${humePayload}`;

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(captureAnalysisSchema),
            name: "CaptureDeepAnalysis",
            description:
                "Deep analysis of a captured English conversation for coaching purposes.",
        }),
        system: readPrompt(),
        prompt,
        temperature: 0.15,
    });

    return {
        serverTitle: result.output.serverTitle,
        serverSummary: result.output.serverSummary,
        analysis: {
            overview: result.output.overview,
            mainIssue: result.output.mainIssue,
            secondaryIssues: result.output.secondaryIssues,
            notes: result.output.notes,
            structureAndFlow: result.output.structureAndFlow,
            clarityAndConciseness: result.output.clarityAndConciseness,
            relevanceAndFocus: result.output.relevanceAndFocus,
            engagement: result.output.engagement,
            professionalism: result.output.professionalism,
            voiceToneExpression: result.output.voiceToneExpression,
            improvements: result.output.improvements,
            regressions: result.output.regressions,
            teachableMoments: result.output.teachableMoments,
            grammarPatterns: result.output.grammarPatterns,
            vocabulary: result.output.vocabulary,
            fillerWords: result.output.fillerWords,
            fluency: result.output.fluency,
            communicationStyle: result.output.communicationStyle,
            nativeSpeakerRewrites: result.output.nativeSpeakerRewrites,
            nativeSpeakerVersion: result.output.nativeSpeakerVersion,
        },
    };
}
