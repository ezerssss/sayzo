import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
    GrammarPattern,
    StructuralObservation,
    TurnRewrite,
} from "@/types/captures";
import type { HumeExpressionSummary } from "@/types/hume-expression";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";
import {
    reconcileMoments,
    reconcileWithAnchor,
    resolveAnchorIdx,
} from "@/lib/transcripts/anchor-resolver";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

// Unified three-part teachable shape used for every coaching moment
// (`fixTheseFirst`, `moreMoments`, and dimensional `findings`). The old
// separate `whyIssue` + `keyTakeaway` fields are now merged into one
// `whyThisMatters` narrative. See `CoachingMoment` in `types/captures.ts`.
const coachingMomentSchema = z.object({
    anchor: z.string(),
    betterOption: z.string(),
    whyThisMatters: z.string(),
});

/**
 * LLM-facing teachable moment shape. `transcriptIdx` and `timestamp` are
 * deliberately absent — they are server-set from the verbatim `anchor` text
 * via `lib/transcripts/anchor-resolver` so a hallucinated line number can't
 * pin coaching to the wrong utterance.
 */
const llmTeachableMomentSchema = coachingMomentSchema.extend({
    type: z.enum([
        "grammar",
        "filler",
        "phrasing",
        "vocabulary",
        "communication",
    ]),
    severity: z.enum(["minor", "moderate", "major"]),
});

const rewriteVerdictSchema = z.enum([
    "keep",
    "tighten",
    "sharpen",
    "reframe",
    "reorder",
]);

/**
 * LLM-facing turn rewrite shape. `transcriptIdx` is server-set from the
 * verbatim `original` text. `suggestedBeforeIdx` stays — it's a forward
 * reference to another turn that can't be resolved from anchor text — but
 * the server bounds-checks it after the fact and clamps invalid values to
 * `null`.
 */
const llmTurnRewriteSchema = z.object({
    original: z.string(),
    rewrite: z.string(),
    verdict: rewriteVerdictSchema,
    note: z.string().nullable(),
    suggestedBeforeIdx: z.number().nullable(),
});

const structuralObservationSchema = z.object({
    observation: z.string(),
    explanation: z.string(),
    affectedTurnIdxs: z.array(z.number()),
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

    fixTheseFirst: z.array(llmTeachableMomentSchema),
    moreMoments: z.array(llmTeachableMomentSchema),
    grammarPatterns: z.array(
        z.object({
            pattern: z.string(),
            frequency: z.number(),
            // `text` must be a verbatim user-line substring — the server
            // resolves transcriptIdx from it so the LLM doesn't have to
            // guess the index.
            examples: z.array(z.object({ text: z.string() })),
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

    turnRewrites: z.array(llmTurnRewriteSchema),
    structuralObservations: z.array(structuralObservationSchema),
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

    const isUserLine = (line: CaptureTranscriptLine) =>
        line.speaker === "user";

    // Coaching moments anchor on user-line text only; resolve verbatim
    // anchors against the transcript and drop hallucinated quotes.
    const fixTheseFirst = reconcileMoments(
        result.output.fixTheseFirst,
        transcript,
        isUserLine,
    );
    const moreMoments = reconcileMoments(
        result.output.moreMoments,
        transcript,
        isUserLine,
    );

    // Turn rewrites: resolve transcriptIdx from the verbatim `original`
    // text. `suggestedBeforeIdx` is a forward reference to another turn —
    // we can't anchor that from text, so we just bounds-check.
    const turnRewrites: TurnRewrite[] = reconcileWithAnchor(
        result.output.turnRewrites,
        (t) => t.original,
        (t, idx) => ({
            transcriptIdx: idx,
            original: t.original,
            rewrite: t.rewrite,
            verdict: t.verdict,
            note: t.note,
            suggestedBeforeIdx:
                t.suggestedBeforeIdx != null &&
                Number.isInteger(t.suggestedBeforeIdx) &&
                t.suggestedBeforeIdx >= 0 &&
                t.suggestedBeforeIdx < transcript.length
                    ? t.suggestedBeforeIdx
                    : null,
        }),
        transcript,
        isUserLine,
    );

    // Grammar pattern examples: each carries a verbatim user-line snippet.
    // Resolve idx, drop unresolved examples, and drop the whole pattern if
    // it ends up with no examples.
    const grammarPatterns: GrammarPattern[] = result.output.grammarPatterns
        .map((gp) => {
            const examples = gp.examples
                .map((ex) => {
                    const resolved = resolveAnchorIdx({
                        anchor: ex.text,
                        lines: transcript,
                        speakerFilter: isUserLine,
                    });
                    if (resolved.confidence === "unresolved") return null;
                    return { transcriptIdx: resolved.idx, text: ex.text };
                })
                .filter((ex): ex is { transcriptIdx: number; text: string } =>
                    ex !== null,
                );
            return {
                pattern: gp.pattern,
                frequency: gp.frequency,
                examples,
            };
        })
        .filter((gp) => gp.examples.length > 0);

    // Structural observations: `affectedTurnIdxs` references other turns
    // (cross-turn observation) — bounds-check and drop out-of-range ones.
    // If the observation ends up with no valid affected turns, keep it
    // anyway because the prose `observation` + `explanation` still teach.
    const structuralObservations: StructuralObservation[] =
        result.output.structuralObservations.map((o) => ({
            observation: o.observation,
            explanation: o.explanation,
            affectedTurnIdxs: o.affectedTurnIdxs.filter(
                (idx) =>
                    Number.isInteger(idx) && idx >= 0 && idx < transcript.length,
            ),
        }));

    const analysis: CaptureAnalysis = {
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
        fixTheseFirst,
        moreMoments,
        grammarPatterns,
        vocabulary: result.output.vocabulary,
        fillerWords: result.output.fillerWords,
        fluency: result.output.fluency,
        communicationStyle: result.output.communicationStyle,
        turnRewrites,
        structuralObservations,
    };

    return {
        serverTitle: result.output.serverTitle,
        serverSummary: result.output.serverSummary,
        analysis,
    };
}
