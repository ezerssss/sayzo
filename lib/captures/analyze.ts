import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureTranscriptLine,
    CoachingInsight,
    CoachingInsightType,
    GrammarPattern,
    ItemAnalysis,
    StructuralObservation,
    TurnRewrite,
} from "@/schemas";
import type { DifferentialContext } from "@/schemas";
import type { LearnerModel } from "@/schemas";
import type { UserProfileType } from "@/schemas";
import {
    coachingInsightTypeSchema,
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
import { loadModelPrompt } from "@/lib/openai/prompt";
import { temperatureOptions } from "@/lib/openai/reasoning";
import { sanitizeSpokenFields } from "@/lib/text/despeechify";
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

    // Single card-sized coaching takeaway (or null). Kept deliberately LENIENT
    // (plain string `type`, no length caps) so a malformed insight can never
    // fail the whole structured-output parse — the server coerces the enum,
    // enforces the char limits, and verifies the quote in post-processing.
    coachingInsight: z
        .object({
            type: z.string(),
            headline: z.string(),
            quote: z.string().nullable(),
            body: z.string(),
            why: z.string().nullable(),
        })
        .nullable(),
    // English-only coaching: false when the user's own speech is predominantly
    // non-English, so the server suppresses the (English) coaching card.
    userLanguageIsEnglish: z.boolean(),
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

/**
 * Sampling temperature for the analyzer. Low default (0.15) keeps dimensional
 * scoring deterministic; can be raised via env (e.g. 0.5-0.7) when paired with
 * a more capable model to encourage creative moment-finding in
 * `coachingInsight`. Invalid values fall back to the default.
 */
function defaultTemperature(): number {
    const raw = process.env.CAPTURE_ANALYZER_TEMPERATURE?.trim();
    if (!raw) return 0.15;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2
        ? parsed
        : 0.15;
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

/** Trim a string to `max` chars on a word boundary (keeps card copy readable). */
function trimToLimit(value: string, max: number): string {
    const t = value.trim();
    if (t.length <= max) return t;
    const slice = t.slice(0, max);
    const lastSpace = slice.lastIndexOf(" ");
    return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim();
}

/**
 * Trim a quote to `max` chars preferring clause-boundary breaks so the result
 * doesn't end mid-thought. Tries sentence-end (.!?) first (kept), then mid-
 * clause (,;:—) (dropped), then word boundary, then hard cut.
 *
 * Why a separate function: the body of a coachingInsight often rewrites the
 * same span as the quote (e.g. body: `Try: "..."`). A mid-word cut on the
 * quote breaks the visual alignment between "You said: ..." and the rewrite —
 * the reader can't mentally diff a half-sentence against a full one.
 */
function trimQuoteToLimit(value: string, max: number): string {
    const t = value.trim();
    if (t.length <= max) return t;

    const slice = t.slice(0, max);
    const minBoundary = max * 0.6;

    // Sentence-end punctuation — keep it (a quote ending in "." or "?" reads cleanly).
    for (let i = slice.length - 1; i >= minBoundary; i--) {
        if (/[.!?]/.test(slice[i])) {
            return slice.slice(0, i + 1).trim();
        }
    }
    // Mid-clause punctuation — cut BEFORE it (don't end a quote with a comma/dash).
    for (let i = slice.length - 1; i >= minBoundary; i--) {
        if (/[,;:—]/.test(slice[i])) {
            return slice.slice(0, i).trim();
        }
    }
    // Word boundary fallback (same threshold as trimToLimit).
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > minBoundary) {
        return slice.slice(0, lastSpace).trim();
    }
    // No good boundary — hard cut.
    return slice.trim();
}

/**
 * Verify a coaching-insight quote against the user's own transcript lines and
 * return the user's VERBATIM words (or null). Stricter than the moment
 * reconcilers: accept only `exact`/`span` resolutions and REJECT the resolver's
 * `fuzzy` (paraphrase) path — the feature's rule 1 is "real quotes only" and the
 * agent cannot re-check this. User lines are already echo-leak filtered at
 * transcription time, so a user-line match is inherently the post-echo set.
 */
function verifyInsightQuote(
    quote: string | null | undefined,
    transcript: CaptureTranscriptLine[],
): string | null {
    const q = quote?.trim();
    if (!q) return null;

    const resolved = resolveAnchorIdx({
        anchor: q,
        lines: transcript,
        speakerFilter: (l) => l.speaker === "user",
    });
    if (resolved.confidence !== "exact" && resolved.confidence !== "span") {
        return null;
    }

    // Always return REAL user-transcript text, never the LLM's string: if the
    // quote is a raw (case-insensitive) substring of the resolved line, slice
    // that exact span; otherwise (a `span` across lines, or punctuation-only
    // differences from the normalized match) fall back to the resolved user
    // line itself — still the verbatim words the user actually said, so the
    // stored quote is always a genuine substring of the user's own channel.
    const line = transcript[resolved.idx];
    if (!line) return null;
    const at = line.text.toLowerCase().indexOf(q.toLowerCase());
    const verbatim = at >= 0 ? line.text.slice(at, at + q.length) : line.text;
    return trimQuoteToLimit(verbatim, 120);
}

/**
 * Canonical generic-advice stems the prompt's Rule #1 lists as INVALID
 * insights. Kept here as a code-level floor — the same model that's being
 * asked to avoid these is the one emitting them, so prose-only suppression
 * is hope, not enforcement. Substring match on case-folded text with
 * punctuation stripped, so variants like "Reducing redundancy and filler
 * words will help…" still hit "reducing redundancy and filler". Prompt and
 * verifier enforce the same list — one as instruction, one as floor.
 */
const GENERIC_INSIGHT_STEMS = [
    "streamline your thoughts",
    "reducing redundancy and filler",
    "be more concise",
    "work on your structure",
    "speak with more confidence",
    "use precise language",
    "organize your thoughts",
];

function isGenericInsightText(text: string): boolean {
    const norm = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
    return GENERIC_INSIGHT_STEMS.some((stem) => norm.includes(stem));
}

/**
 * Build the stored `coachingInsight` from the lenient LLM output: gate on the
 * language flag, coerce the type to the enum, enforce the char limits, and
 * verify the quote. Wrapped so it NEVER throws — on any problem we return null
 * and the capture still reaches `analyzed` (failure isolation). `null` is also
 * the correct output when nothing is actionable.
 */
function buildCoachingInsight(
    raw: {
        type: string;
        headline: string;
        quote: string | null;
        body: string;
        why: string | null;
    } | null,
    languageIsEnglish: boolean,
    transcript: CaptureTranscriptLine[],
): CoachingInsight | null {
    try {
        if (!raw || !languageIsEnglish) return null;

        const headline = trimToLimit(raw.headline ?? "", 60);
        const body = trimToLimit(raw.body ?? "", 140);
        // A card with no headline or no concrete suggestion teaches nothing.
        if (!headline || !body) return null;

        // Hard reject the bromides the prompt's Rule #1 lists as INVALID.
        // See GENERIC_INSIGHT_STEMS above for why the same list lives in code.
        if (isGenericInsightText(headline) || isGenericInsightText(body)) {
            console.warn(
                "[coaching-insight] rejected as generic — headline/body matched a deny-list stem",
            );
            return null;
        }

        const parsedType = coachingInsightTypeSchema.safeParse(raw.type);
        const type: CoachingInsightType = parsedType.success
            ? parsedType.data
            : "other";

        const quote = verifyInsightQuote(raw.quote, transcript);
        const whyTrimmed = trimToLimit(raw.why ?? "", 80);
        const why = whyTrimmed.length > 0 ? whyTrimmed : null;

        return { type, headline, quote, body, why };
    } catch {
        return null;
    }
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

    const modelName = defaultModel();
    const result = await generateText({
        model: openai(modelName),
        output: Output.object({
            schema: zodSchema(captureAnalysisSchema),
            name: "CaptureDeepAnalysis",
            description:
                "Deep analysis of a captured English conversation for coaching purposes.",
        }),
        // Reasoning models (gpt-5-mini default here) get the lean, example-free
        // prompt; fast models keep the few-shot blocks. See loadModelPrompt.
        system: loadModelPrompt(readPrompt(), modelName),
        prompt,
        ...temperatureOptions(modelName, defaultTemperature()),
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
        coachingInsight: buildCoachingInsight(
            result.output.coachingInsight,
            result.output.userLanguageIsEnglish,
            transcript,
        ),
    };

    return {
        serverTitle: result.output.serverTitle,
        serverSummary: result.output.serverSummary,
        // Floor: strip un-speakable em/en dashes from spoken sub-fields
        // (turnRewrites.rewrite, coachingInsight.body, every betterOption).
        // The prompt asks the model to avoid them; this guarantees it.
        analysis: sanitizeSpokenFields(analysis),
    };
}
