import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureTranscriptLine,
    GrammarPattern,
    ItemAnalysis,
    StructuralObservation,
    TurnRewrite,
} from "@/schemas";
import type { DifferentialContext } from "@/schemas";
import type { LearnerModel } from "@/schemas";
import type { UserProfileType } from "@/schemas";
import {
    communicationStyleSchema,
    dimensionalAnalysisSchema,
    fillerWordAnalysisSchema,
    fluencyMetricsSchema,
    llmGrammarPatternSchema,
    llmTeachableMomentSchema,
    llmTurnRewriteSchema,
    structuralObservationSchema,
    vocabularyAssessmentSchema,
} from "@/schemas";
import {
    reconcileMoments,
    reconcileWithAnchor,
    resolveAnchorIdx,
} from "@/lib/transcripts/anchor-resolver";
import { formatDifferentialBlocks } from "@/lib/learner-model/format-differential";
import { isShortUserDrillLine } from "./drill-input-filter";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

// Capture LLM output: the idx-less coaching shapes (the server resolves
// transcript positions from verbatim anchors) plus a server-generated
// title/summary. Building blocks import from `@/schemas` (single source of
// truth). All conversation metrics are REQUIRED here — a capture always
// produces them, unlike the shared `llmItemAnalysisSchema` where they're
// optional so a 60s drill can omit them.
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

    improvements: z.array(z.string()),
    regressions: z.array(z.string()),

    fixTheseFirst: z.array(llmTeachableMomentSchema),
    moreMoments: z.array(llmTeachableMomentSchema),
    grammarPatterns: z.array(llmGrammarPatternSchema),
    vocabulary: vocabularyAssessmentSchema,
    fillerWords: fillerWordAnalysisSchema,
    fluency: fluencyMetricsSchema,
    communicationStyle: communicationStyleSchema,

    turnRewrites: z.array(llmTurnRewriteSchema),
    structuralObservations: z.array(structuralObservationSchema),
});

type AnalysisResult = {
    serverTitle: string;
    serverSummary: string;
    analysis: ItemAnalysis;
};

export type CaptureAnalyzerInput = {
    transcript: CaptureTranscriptLine[];
    agentTitle: string;
    agentSummary: string;
    durationSecs: number;
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
        LearnerModel,
        "strengths" | "weaknesses" | "masteredFocus" | "reinforcementFocus"
    >;
    /** History slice that makes feedback differential (tracked habits + recent headlines). */
    differential: DifferentialContext;
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

function formatTranscript(
    transcript: CaptureTranscriptLine[],
    skip: (line: CaptureTranscriptLine, idx: number) => boolean = () => false,
): string {
    const lines: string[] = [];
    for (let idx = 0; idx < transcript.length; idx++) {
        const line = transcript[idx];
        if (skip(line, idx)) continue;
        lines.push(
            `[${idx}] [${line.start.toFixed(1)}s - ${line.end.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        );
    }
    return lines.join("\n");
}

export async function analyzeCaptureDeep(
    input: CaptureAnalyzerInput,
): Promise<AnalysisResult> {
    const {
        transcript,
        agentTitle,
        agentSummary,
        durationSecs,
        userProfile,
        skillMemory,
        differential,
    } = input;

    // Hide short user lines from the LLM so post-AEC echo-bleed fragments
    // (1-2 word residues) don't get anchored as teachable moments. The
    // array stays unfiltered — indices in the formatted prompt remain the
    // original `serverTranscript` indices, so any idx the LLM emits
    // (`suggestedBeforeIdx`, `affectedTurnIdxs`) and any anchor the
    // reconciler resolves both land on the right line in stored analysis.
    // See lib/captures/drill-input-filter.
    const userLines = transcript.filter(
        (l) => l.speaker === "user" && !isShortUserDrillLine(l),
    );
    const totalUserWords = userLines.reduce(
        (sum, l) => sum + l.text.split(/\s+/).length,
        0,
    );
    const userSpeakingMins =
        userLines.reduce((sum, l) => sum + (l.end - l.start), 0) / 60;

    const { trackedBlock, recentIssuesBlock } =
        formatDifferentialBlocks(differential);

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

## Tracked habits (what we already know — be differential, don't re-headline these)
${trackedBlock}

## Recent main-issue headlines (newest first — do NOT repeat headline #1; acknowledge progress then redirect)
${recentIssuesBlock}

## Capture context (from the desktop agent's small local LLM — may contain errors)
Agent-generated title (UNRELIABLE — may misidentify speakers or use wrong names): ${agentTitle}
Agent-generated summary (UNRELIABLE — may attribute the user's actions to other speakers): ${agentSummary}
Duration: ${Math.round(durationSecs)} seconds
User word count: ~${totalUserWords}
User speaking minutes: ~${userSpeakingMins.toFixed(1)}

## Full transcript (indexed, speaker-tagged — THIS is the source of truth)
The "user" speaker is the learner. ALL other speakers (other_1, other_2, etc.) are not the learner. Base ALL coaching, ALL facts, and ALL identity on the transcript speaker labels — NOT on the agent title/summary above which may have gotten the identity wrong.
Indices are NOT contiguous — a few sub-coaching-threshold user fragments are hidden. Only the indices shown above are valid; do not reference any index that does not appear in the transcript block.
${formatTranscript(transcript, isShortUserDrillLine)}`;

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
    // we can't anchor that from text, so we bounds-check AND reject
    // indices pointing at filtered (short-user) lines that the prompt hid.
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
                t.suggestedBeforeIdx < transcript.length &&
                !isShortUserDrillLine(transcript[t.suggestedBeforeIdx])
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
    // (cross-turn observation) — bounds-check, AND drop indices pointing
    // at filtered (short-user) lines that the prompt hid. If the observation
    // ends up with no valid affected turns, keep it anyway because the prose
    // `observation` + `explanation` still teach.
    const structuralObservations: StructuralObservation[] =
        result.output.structuralObservations.map((o) => ({
            observation: o.observation,
            explanation: o.explanation,
            affectedTurnIdxs: o.affectedTurnIdxs.filter(
                (idx) =>
                    Number.isInteger(idx) &&
                    idx >= 0 &&
                    idx < transcript.length &&
                    !isShortUserDrillLine(transcript[idx]),
            ),
        }));

    const analysis: ItemAnalysis = {
        overview: result.output.overview,
        mainIssue: result.output.mainIssue,
        secondaryIssues: result.output.secondaryIssues,
        notes: result.output.notes,
        structureAndFlow: result.output.structureAndFlow,
        clarityAndConciseness: result.output.clarityAndConciseness,
        relevanceAndFocus: result.output.relevanceAndFocus,
        engagement: result.output.engagement,
        professionalism: result.output.professionalism,
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
