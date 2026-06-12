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
import { loadModelPromptParts } from "@/lib/openai/prompt";
import { modelTuningOptions } from "@/lib/openai/reasoning";
import { sanitizeSpokenFields } from "@/lib/text/despeechify";
import { isShortUserDrillLine } from "./drill-input-filter";
import { findFabricatedToken } from "./fabrication-floor";

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
    // (plain string `type`) so a malformed insight can never fail the whole
    // structured-output parse — the server coerces the enum, trims whitespace,
    // and verifies the quote in post-processing. Field lengths are uncapped.
    coachingInsight: z
        .object({
            type: z.string(),
            headline: z.string(),
            quote: z.string().nullable(),
            body: z.string(),
            why: z.string().nullable(),
        })
        .nullable(),
    // English-only coaching: false only when the user's speech contains
    // essentially no coachable English, so the server suppresses the (English)
    // coaching card. Mixed-language captures with coachable English turns are
    // true — their non-English turns are handled per-turn via the
    // `non_english` rewrite verdict instead.
    hasCoachableEnglish: z.boolean(),
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

const REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * Reasoning effort for the capture analyzer (reasoning models only). Default
 * "low": this is an extraction-style task over a delimited transcript — the
 * documented case for scaling effort DOWN — and it sits in the latency window
 * the desktop agent polls. Overridable via env (invalid values fall back).
 */
function defaultReasoningEffort(): ReasoningEffort {
    const raw = process.env.CAPTURE_ANALYZER_REASONING_EFFORT?.trim();
    return REASONING_EFFORTS.includes(raw as ReasoningEffort)
        ? (raw as ReasoningEffort)
        : "low";
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

/**
 * Verify a coaching-insight quote against the user's own transcript lines and
 * return the user's VERBATIM words (or null). Stricter than the moment
 * reconcilers: accept only `exact`/`span` resolutions and REJECT the resolver's
 * `fuzzy` (paraphrase) path — the feature's rule 1 is "real quotes only" and the
 * agent cannot re-check this. User lines are already echo-leak filtered at
 * transcription time, so a user-line match is inherently the post-echo set.
 * The quote is returned at full length — the card wraps, so a complete thought
 * is never trimmed to a fragment (the "complete thought" contract is enforced
 * by the prompt; the server never shortens what it verified as verbatim).
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
    return verbatim.trim();
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

/** A `Try: "…"` body is a direct rewrite of the quote — it makes no sense on
 * the agent card without a verified quote next to it. */
function isTryRewriteBody(body: string): boolean {
    return /(^|\s)try[:,]?\s*["“]/i.test(body);
}

/** Double-quoted spans (straight or curly) — the spoken-rewrite portions of a
 * framing field like the insight body or a `betterOption`. */
function extractQuotedSpans(text: string): string[] {
    const spans: string[] = [];
    for (const re of [/"([^"\n]+)"/g, /“([^”\n]+)”/g]) {
        for (const m of text.matchAll(re)) spans.push(m[1]);
    }
    return spans;
}

// Fabrication floor (findFabricatedToken + token tables) lives in
// ./fabrication-floor — shared with the meeting-summary pass.

/**
 * Build the stored `coachingInsight` from the lenient LLM output: gate on the
 * language flag, coerce the type to the enum, trim whitespace, and verify the
 * quote. Field lengths are uncapped (the card wraps). Wrapped so it NEVER
 * throws — on any problem we return null and the capture still reaches
 * `analyzed` (failure isolation). `null` is also the correct output when
 * nothing is actionable.
 */
function buildCoachingInsight(
    raw: {
        type: string;
        headline: string;
        quote: string | null;
        body: string;
        why: string | null;
    } | null,
    hasCoachableEnglish: boolean,
    transcript: CaptureTranscriptLine[],
): CoachingInsight | null {
    try {
        if (!raw || !hasCoachableEnglish) return null;

        const headline = (raw.headline ?? "").trim();
        const body = (raw.body ?? "").trim();
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

        // A Try-rewrite body with no verified quote would show the reader a
        // rewrite of something they can't see — scope parity is unverifiable
        // and the card is misleading. Null is first-class; reject.
        if (isTryRewriteBody(body) && quote === null) {
            console.warn(
                "[coaching-insight] rejected: Try-rewrite body without a verified quote",
            );
            return null;
        }

        // Fabrication floor: suggested wording may not contain specifics the
        // conversation never contained.
        const fabricated = findFabricatedToken(
            extractQuotedSpans(body),
            transcript,
        );
        if (fabricated) {
            console.warn(
                `[coaching-insight] rejected: body invents a specific not in the transcript ("${fabricated}")`,
            );
            return null;
        }

        const whyTrimmed = (raw.why ?? "").trim();
        const why = whyTrimmed.length > 0 ? whyTrimmed : null;

        return { type, headline, quote, body, why };
    } catch {
        return null;
    }
}

/**
 * Log-only fabrication telemetry for the non-card suggestion surfaces.
 * Deliberately NOT enforced yet: turnRewrites can't simply be dropped (the
 * coverage invariant — enforcement would mean downgrading to `keep`), and the
 * token floor's false-positive rate on free-form rewrites is unproven. Watch
 * these warnings in production; promote to enforcement once the rate is
 * known-near-zero. The agent-facing coachingInsight is the only hard-enforced
 * surface (see buildCoachingInsight).
 */
/**
 * Server-enforced invariant for `non_english` turn entries: a pure
 * passthrough of the transcribed text — `rewrite === original`, no note, no
 * reorder target. The prompt asks the model for this; the server guarantees
 * it so the UI and despeechify floor can rely on it.
 */
function enforceNonEnglishPassthrough(t: TurnRewrite): TurnRewrite {
    if (t.verdict !== "non_english") return t;
    return {
        ...t,
        rewrite: t.original,
        note: null,
        suggestedBeforeIdx: null,
    };
}

function logFabricationTelemetry(
    analysis: Pick<
        ItemAnalysis,
        "turnRewrites" | "fixTheseFirst" | "moreMoments"
    >,
    transcript: CaptureTranscriptLine[],
): void {
    try {
        for (const t of analysis.turnRewrites ?? []) {
            // non_english entries are a verbatim passthrough of garbled
            // transcript text, not a rewrite — nothing to check.
            if (t.verdict === "non_english") continue;
            const token = findFabricatedToken([t.rewrite], transcript);
            if (token) {
                console.warn(
                    `[fabrication-telemetry] turnRewrites[${t.transcriptIdx}].rewrite contains "${token}" not found in transcript`,
                );
            }
        }
        const moments = [
            ...analysis.fixTheseFirst,
            ...(analysis.moreMoments ?? []),
        ];
        for (const m of moments) {
            const token = findFabricatedToken(
                extractQuotedSpans(m.betterOption),
                transcript,
            );
            if (token) {
                console.warn(
                    `[fabrication-telemetry] betterOption (anchor "${m.anchor.slice(0, 40)}") contains "${token}" not found in transcript`,
                );
            }
        }
    } catch {
        // Telemetry must never break analysis.
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
    // Reasoning models (gpt-5-mini default here) get the lean, example-free
    // prompt; fast models keep the few-shot blocks plus a post-transcript
    // rule recap (late instructions weigh heavier on chat models). See
    // loadModelPromptParts.
    const promptParts = loadModelPromptParts(readPrompt(), modelName);
    const result = await generateText({
        model: openai(modelName),
        output: Output.object({
            schema: zodSchema(captureAnalysisSchema),
            name: "CaptureDeepAnalysis",
            description:
                "Deep analysis of a captured English conversation for coaching purposes.",
        }),
        system: promptParts.system,
        prompt: promptParts.postTranscriptRecap
            ? `${prompt}\n\n${promptParts.postTranscriptRecap}`
            : prompt,
        ...modelTuningOptions(modelName, {
            temperature: defaultTemperature(),
            reasoningEffort: defaultReasoningEffort(),
            // Per-field length contracts in the prompt ("2-4 sentences")
            // locally override the low global verbosity.
            textVerbosity: "low",
        }),
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
        (t, idx) =>
            enforceNonEnglishPassthrough({
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
            result.output.hasCoachableEnglish,
            transcript,
        ),
    };

    logFabricationTelemetry(analysis, transcript);

    return {
        serverTitle: result.output.serverTitle,
        serverSummary: result.output.serverSummary,
        // Floor: strip un-speakable punctuation (dashes everywhere; colons,
        // semicolons, brackets inside quoted spoken wording) from spoken
        // sub-fields (turnRewrites.rewrite, coachingInsight.body, every
        // betterOption). The prompt asks the model to avoid them; this
        // guarantees it. See lib/text/despeechify.ts.
        analysis: sanitizeSpokenFields(analysis),
    };
}

// Exposed for unit tests only (mirrors lib/transcripts/anchor-resolver.ts).
export const __test = {
    buildCoachingInsight,
    enforceNonEnglishPassthrough,
    verifyInsightQuote,
    isTryRewriteBody,
    extractQuotedSpans,
    findFabricatedToken,
    isGenericInsightText,
};
