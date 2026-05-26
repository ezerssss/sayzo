import { z } from "zod";

import {
    focusThemeCategorySchema,
    focusThemeConfidenceSchema,
    focusThemeTrendSchema,
} from "@/schemas/shared/enums";

/**
 * Aggregated coaching view per user — `user-focus-insights/{uid}`.
 *
 * NOTE: Phase 3 of the rework folds this into the merged `learner-models` doc
 * (as a synthesized projection read by the analyzer). Until then it stays its
 * own owner-readable collection so the Focus dashboard's client read keeps
 * working unchanged.
 */

/** One concrete moment backing a focus theme; deep-links into a session/capture. */
export const focusEvidenceSchema = z.object({
    source: z.enum(["session", "capture"]),
    sourceId: z.string(),
    sourceTitle: z.string(),
    createdAt: z.string(),
    quote: z.string(),
    note: z.string(),
});
export type FocusEvidence = z.infer<typeof focusEvidenceSchema>;

/**
 * A single area to work on, written as plain-language behavior (not a linguistic
 * category), with evidence, trend, and a concrete next step. `id` is stable so
 * trends diff across regenerations.
 */
export const focusThemeSchema = z.object({
    id: z.string(),
    title: z.string(),
    cost: z.string(),
    nudge: z.string(),
    category: focusThemeCategorySchema,
    isEmergent: z.boolean(),
    frequencySummary: z.string(),
    trend: focusThemeTrendSchema,
    trendSummary: z.string(),
    evidence: z.array(focusEvidenceSchema),
    confidence: focusThemeConfidenceSchema,
});
export type FocusTheme = z.infer<typeof focusThemeSchema>;

/** Something the user used to do that has faded — a progress signal. */
export const focusWinSchema = z.object({
    statement: z.string(),
    lastSeen: focusEvidenceSchema.optional(),
});
export type FocusWin = z.infer<typeof focusWinSchema>;

export type UserFocusInsights = {
    uid: string;
    /** Ranked top themes to focus on (typically 3-5). Non-empty when data is sufficient. */
    themes: FocusTheme[];
    /** Progress signals — behaviors that have faded or appear less. */
    wins: FocusWin[];
    /** 2-4 sentence narrative summary, plain language. */
    overview: string;
    /** True when data is too thin to produce themes yet. */
    insufficientData: boolean;
    sessionsConsidered: number;
    capturesConsidered: number;
    /** Newest session/capture id considered — used to detect staleness. */
    lastSessionId: string;
    lastCaptureId: string;
    generatedAt: string;
    updatedAt: string;
    version: number;
};

export const FOCUS_INSIGHTS_VERSION = 1;
