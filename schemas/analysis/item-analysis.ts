import { z } from "zod";

import {
    llmTeachableMomentSchema,
    teachableMomentSchema,
} from "@/schemas/shared/coaching-moment";
import { dimensionalAnalysisSchema } from "@/schemas/shared/dimensional-analysis";

import type { TrackedPattern } from "@/schemas/learner-model/tracked-pattern";

import { structuralObservationSchema } from "./structural-observation";
import { llmTurnRewriteSchema, turnRewriteSchema } from "./turn-rewrite";

/**
 * Unified per-item analysis for BOTH drills (60s monologue) and captures
 * (multi-turn conversation). Common fields cover the shared coaching surface;
 * conversation-only and monologue-only fields are optional so one schema, one
 * renderer, and one set of consumers serve both.
 *
 * The LLM never emits transcript indices — see `llmItemAnalysisSchema` and
 * `lib/transcripts/anchor-resolver` (verbatim anchors resolve server-side).
 */

// ── Quantitative metrics (conversation-only; drills are too short to be meaningful) ──

export const llmGrammarPatternSchema = z.object({
    pattern: z.string(),
    frequency: z.number(),
    /** Each `text` is a verbatim user-line substring; the server resolves its index. */
    examples: z.array(z.object({ text: z.string() })),
});
export type LlmGrammarPattern = z.infer<typeof llmGrammarPatternSchema>;

export const grammarPatternSchema = z.object({
    pattern: z.string(),
    frequency: z.number(),
    examples: z.array(
        z.object({ transcriptIdx: z.number(), text: z.string() }),
    ),
});
export type GrammarPattern = z.infer<typeof grammarPatternSchema>;

export const vocabularyAssessmentSchema = z.object({
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
});
export type VocabularyAssessment = z.infer<typeof vocabularyAssessmentSchema>;

export const fillerWordBreakdownEntrySchema = z.object({
    word: z.string(),
    count: z.number(),
});
export type FillerWordBreakdownEntry = z.infer<
    typeof fillerWordBreakdownEntrySchema
>;

export const fillerWordAnalysisSchema = z.object({
    totalCount: z.number(),
    perMinute: z.number(),
    breakdown: z.array(fillerWordBreakdownEntrySchema),
    timestamps: z.array(z.number()),
});
export type FillerWordAnalysis = z.infer<typeof fillerWordAnalysisSchema>;

export const fluencyMetricsSchema = z.object({
    wordsPerMinute: z.number(),
    avgPauseDurationMs: z.number(),
    selfCorrections: z.number(),
    avgResponseLatencyMs: z.number(),
});
export type FluencyMetrics = z.infer<typeof fluencyMetricsSchema>;

export const communicationStyleSchema = z.object({
    directness: z.number(),
    formality: z.number(),
    confidence: z.number(),
    turnTaking: z.enum(["balanced", "passive", "dominant"]),
});
export type CommunicationStyle = z.infer<typeof communicationStyleSchema>;

// ── Main-issue shape (the transferable lesson) ──

/**
 * Transferable lesson paired with `mainIssue` (diagnosis) and `fixTheseFirst`
 * (worked rewrite): `principle` is the quotable heuristic, `shape` the 2-5 step
 * skeleton (steps joined with `→`). Null when no top fix earned a slot.
 */
export const mainIssueShapeSchema = z.object({
    principle: z.string(),
    shape: z.string(),
});
export type MainIssueShape = z.infer<typeof mainIssueShapeSchema>;

// ── The unified analysis ──

export const itemAnalysisSchema = z.object({
    // Common
    overview: z.string(),
    mainIssue: z.string(),
    /** Drills always set this (null when no top fix earned a slot); captures may omit. */
    mainIssueShape: mainIssueShapeSchema.nullable().optional(),
    /** Drills always set this (null most of the time); captures may omit. */
    whatWentWell: z.string().nullable().optional(),
    secondaryIssues: z.array(z.string()),
    notes: z.string(),

    structureAndFlow: dimensionalAnalysisSchema,
    clarityAndConciseness: dimensionalAnalysisSchema,
    relevanceAndFocus: dimensionalAnalysisSchema,
    engagement: dimensionalAnalysisSchema,
    professionalism: dimensionalAnalysisSchema,

    improvements: z.array(z.string()),
    regressions: z.array(z.string()),

    /** Top 0-3 ranked coaching moments; the feedback page renders `slice(0, 2)`. */
    fixTheseFirst: z.array(teachableMomentSchema),
    /** Additional moments beyond the top priorities. Captures use it; drills omit it. */
    moreMoments: z.array(teachableMomentSchema).optional(),

    // Conversation-only (captures)
    turnRewrites: z.array(turnRewriteSchema).optional(),
    structuralObservations: z.array(structuralObservationSchema).optional(),
    grammarPatterns: z.array(grammarPatternSchema).optional(),
    vocabulary: vocabularyAssessmentSchema.optional(),
    fillerWords: fillerWordAnalysisSchema.optional(),
    fluency: fluencyMetricsSchema.optional(),
    communicationStyle: communicationStyleSchema.optional(),

    // Monologue-only (drills) — produced by the feedback step, not the analyzer
    improvedVersion: z.string().nullable().optional(),
});
export type ItemAnalysis = z.infer<typeof itemAnalysisSchema>;

/**
 * What the analyzer LLM emits: idx-less moments / turn rewrites / grammar
 * examples (server resolves positions from verbatim anchors), and no
 * `improvedVersion` (the separate feedback step produces that).
 */
export const llmItemAnalysisSchema = itemAnalysisSchema
    .extend({
        fixTheseFirst: z.array(llmTeachableMomentSchema),
        moreMoments: z.array(llmTeachableMomentSchema).default([]),
        turnRewrites: z.array(llmTurnRewriteSchema).optional(),
        grammarPatterns: z.array(llmGrammarPatternSchema).optional(),
    })
    .omit({ improvedVersion: true });
export type LlmItemAnalysis = z.infer<typeof llmItemAnalysisSchema>;

// ── Drill feedback step (the "Improved Version" tab) ──

/**
 * The polished native-speaker rewrite of a drill response, with `> **Note:**`
 * annotations. Monologue-only: captures use per-turn `turnRewrites` instead.
 * Produced by the drill feedback step (kept separate from the analyzer so the
 * rewrite can be aligned to the analyzer's `fixTheseFirst`/`mainIssueShape`).
 */
export const sessionFeedbackSchema = z.object({
    improvedVersion: z.string().nullable(),
});
export type SessionFeedbackType = z.infer<typeof sessionFeedbackSchema>;

export function hasSessionFeedbackContent(
    feedback: SessionFeedbackType | null | undefined,
): boolean {
    return Boolean(feedback?.improvedVersion?.trim());
}

// ── Differential context (history fed to the analyzers) ──

/** One recent item's headline, for the "don't re-headline what you just said" rule. */
export type RecentMainIssue = {
    sourceId: string;
    mainIssue: string;
    createdAt: string;
};

/**
 * The history slice fed to the analyzers so per-item feedback is *differential*:
 * the learner's known habits (with server-owned trend/recency) + the recent
 * `mainIssue` headlines of the SAME modality (drills for a drill, captures for a
 * capture). Lets feedback acknowledge progress then redirect, instead of
 * re-diagnosing the same top gap every time.
 */
export type DifferentialContext = {
    trackedPatterns: TrackedPattern[];
    recentMainIssues: RecentMainIssue[];
};
