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
import type { LlmQualityOutcome } from "@/schemas";
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
import { runInstrumentedLLM } from "@/lib/llm/instrument";
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
    /**
     * Telemetry context. `record: false` (the admin reanalyze-insight preview)
     * skips writing an `llm_events` doc so prompt-iteration runs never pollute
     * production metrics. Omitted → recorded with the given refs.
     */
    telemetry?: {
        uid?: string | null;
        captureId?: string | null;
        record?: boolean;
    };
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
 * Resolve a coaching-insight quote to the user's REAL words, repairing it
 * rather than discarding the card. The card shows only the quote + body and the
 * reader can't see the transcript, so a quote must read as a complete thought
 * the body builds on — but it must also never be paraphrased or stitched
 * together. Three outcomes:
 *
 *   - **verified** — the model's quote grounds verbatim (`exact`/`span`) on a
 *     `user` line. We then EXPAND it to its complete thought: the model is
 *     asked for a whole sentence but often clips a fragment ("…because"), which
 *     reads as disconnected from the rewrite. We grow the verified span out to
 *     its enclosing sentence(s) within the real line — still 100% verbatim,
 *     never invented; the card wraps, so length is fine.
 *   - **recovered** — the quote doesn't ground verbatim but is a near-verbatim
 *     miss (a word or two off). A STRICT fuzzy search (high contiguous-run +
 *     coverage) finds the real user line and returns it. Seeded from the
 *     MODEL'S QUOTE ONLY, never the rewrite — the rewrite is reworded, so the
 *     spans it keeps verbatim are connective filler, and matching on those
 *     would re-create the disconnected-fragment bug.
 *   - **dropped** — nothing grounds confidently. Returns `quote: null`; the
 *     caller still ships the card without a "You said:" line. We never surface
 *     a loosely-related line as a quote.
 *
 * User lines are already echo-leak filtered at transcription time, so a
 * user-line match is inherently the post-echo set.
 */
type QuoteResolution = {
    quote: string | null;
    status: "verified" | "recovered" | "dropped";
};

// Strict bar for the `recovered` path: a long contiguous run AND most of the
// quote's content tokens. Precision over recall — a miss just degrades to a
// quote-less card (safe), while a false positive would show a wrong quote.
const QUOTE_RECOVERY_MIN_RUN = 4;
const QUOTE_RECOVERY_MIN_COVERAGE = 0.7;

// Abbreviations that take a trailing period mid-sentence — a `.` right after
// one is not a sentence boundary. Small by design: the boundary test fails SAFE
// (a missed abbreviation only GROWS the quote, never clips it more), so this
// doesn't need to be exhaustive.
const SENTENCE_ABBREVIATIONS = new Set([
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st",
    "vs", "etc", "inc", "ltd", "co", "no", "dept", "fig", "gen",
]);

/**
 * True when `text[i]` ends a sentence. `!` `?` `…` always do; `.` is trickier
 * and we err toward "not a boundary" so expansion can only grow the quote,
 * never over-clip it. A `.` is NOT a stop when it: sits between two digits (a
 * decimal/time like `3.5`, mirroring lib/text/despeechify.ts); isn't followed
 * by whitespace/line-end (an inner abbreviation dot like the first `.` of
 * `e.g.`/`U.S.`); or follows a single-letter initial (`U.`, `S.`) or a known
 * abbreviation (`Mr.`, `etc.`).
 */
function isSentenceEndAt(text: string, i: number): boolean {
    const ch = text[i];
    if (ch === "!" || ch === "?" || ch === "…") return true;
    if (ch !== ".") return false;
    const prev = text[i - 1];
    const next = text[i + 1];
    if (prev && next && /\d/.test(prev) && /\d/.test(next)) return false;
    if (next !== undefined && !/\s/.test(next)) return false;
    let wordStart = i;
    while (wordStart > 0 && /[A-Za-z]/.test(text[wordStart - 1]!)) wordStart--;
    const word = text.slice(wordStart, i);
    if (word.length === 1 && /[A-Za-z]/.test(word)) return false;
    if (SENTENCE_ABBREVIATIONS.has(word.toLowerCase())) return false;
    return true;
}

/**
 * Grow a matched span `[matchStart, matchEnd)` outward to the natural sentence
 * boundaries around it, turning a clipped fragment into the user's complete
 * thought. Left: back to just after the previous terminator, then skip
 * whitespace/opening quotes. Right: forward through the first terminator at or
 * after the match. Returns the verbatim slice, trimmed.
 */
function expandToCompleteThought(
    text: string,
    matchStart: number,
    matchEnd: number,
): string {
    let start = 0;
    for (let i = matchStart - 1; i >= 0; i--) {
        if (isSentenceEndAt(text, i)) {
            start = i + 1;
            break;
        }
    }
    while (start < matchStart && /[\s"'“”‘’(]/.test(text[start]!)) start++;

    let end = text.length;
    for (let i = Math.max(0, matchEnd - 1); i < text.length; i++) {
        if (isSentenceEndAt(text, i)) {
            end = i + 1;
            break;
        }
    }
    return text.slice(start, end).trim();
}

function resolveInsightQuote(
    quote: string | null | undefined,
    transcript: CaptureTranscriptLine[],
): QuoteResolution {
    const q = quote?.trim();
    if (!q) return { quote: null, status: "dropped" };

    // ONE resolver pass with the strict recovery bar. exact/span are decided
    // before (and independently of) the fuzzy branch, so the strict fuzzy
    // thresholds change only whether a near-verbatim miss is RECOVERED — a
    // single call yields verify (exact/span), recover (fuzzy), or drop.
    const resolved = resolveAnchorIdx({
        anchor: q,
        lines: transcript,
        speakerFilter: (l) => l.speaker === "user",
        fuzzyMinRun: QUOTE_RECOVERY_MIN_RUN,
        fuzzyMinCoverage: QUOTE_RECOVERY_MIN_COVERAGE,
    });

    // Verify: exact/span grounding → expand to the complete thought.
    if (resolved.confidence === "exact" || resolved.confidence === "span") {
        const line = transcript[resolved.idx];
        if (line) {
            const at = line.text.toLowerCase().indexOf(q.toLowerCase());
            // `at < 0`: a `span` across lines, or a normalized-only match
            // (punctuation/filler differs) — fall back to the whole resolved
            // line, itself a verbatim complete thought (superset of the quote).
            const verbatim =
                at >= 0
                    ? expandToCompleteThought(line.text, at, at + q.length)
                    : line.text.trim();
            if (verbatim) return { quote: verbatim, status: "verified" };
        }
    }

    // Recover: a near-verbatim miss cleared the strict fuzzy bar. Return the
    // user's real line — note this is the WHOLE user turn (verbatim), not a
    // single-sentence expansion: a fuzzy match has no exact offset to expand
    // around. The turn is still a real, complete thought, but on monologue
    // replays it can be multi-sentence, so a recovered quote can be longer than
    // a verified one (tightening to the matched sentence is a follow-up).
    // Seeded from the model's quote only, never the rewrite.
    if (resolved.confidence === "fuzzy") {
        const text = transcript[resolved.idx]?.text.trim();
        if (text) return { quote: text, status: "recovered" };
    }

    // Degrade: nothing we're sure of — show the card without a quote.
    return { quote: null, status: "dropped" };
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
/**
 * Result of building the stored insight: the insight (or null) plus the
 * quality-outcome code for telemetry. `outcome` is null when an insight is
 * produced, and one of the rejection/null codes otherwise — these are the
 * signals that used to only hit `console.warn`.
 */
type InsightBuildResult = {
    insight: CoachingInsight | null;
    outcome: LlmQualityOutcome | null;
};

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
): InsightBuildResult {
    try {
        if (!raw || !hasCoachableEnglish) {
            return { insight: null, outcome: "INSIGHT_NULL" };
        }

        const headline = (raw.headline ?? "").trim();
        const body = (raw.body ?? "").trim();
        // A card with no headline or no concrete suggestion teaches nothing.
        if (!headline || !body) {
            return { insight: null, outcome: "INSIGHT_NULL" };
        }

        // Hard reject the bromides the prompt's Rule #1 lists as INVALID.
        // See GENERIC_INSIGHT_STEMS above for why the same list lives in code.
        if (isGenericInsightText(headline) || isGenericInsightText(body)) {
            console.warn(
                "[coaching-insight] rejected as generic — headline/body matched a deny-list stem",
            );
            return { insight: null, outcome: "GENERIC_INSIGHT" };
        }

        const parsedType = coachingInsightTypeSchema.safeParse(raw.type);
        const type: CoachingInsightType = parsedType.success
            ? parsedType.data
            : "other";

        // Fabrication floor: suggested wording may not contain specifics the
        // conversation never contained. Hard kill — a made-up fact isn't
        // repairable, and "made-up → don't show" is the bar.
        const fabricated = findFabricatedToken(
            extractQuotedSpans(body),
            transcript,
        );
        if (fabricated) {
            console.warn(
                `[coaching-insight] rejected: body invents a specific not in the transcript ("${fabricated}")`,
            );
            return { insight: null, outcome: "FABRICATED_INSIGHT_BODY" };
        }

        // Repair-first quote: ground + expand, else recover a near-verbatim
        // miss, else DEGRADE to a quote-less card. We never kill a good
        // suggestion over a quote problem — the card is valuable on its own,
        // and we only ever display a quote we're sure of.
        const { quote, status } = resolveInsightQuote(raw.quote, transcript);
        const triedToQuote = (raw.quote ?? "").trim().length > 0;
        let outcome: LlmQualityOutcome | null = null;
        if (status === "recovered") {
            outcome = "INSIGHT_QUOTE_RECOVERED";
            console.info(
                "[coaching-insight] recovered quote from a near-verbatim model quote",
            );
        } else if (status === "dropped" && triedToQuote) {
            // Distinguish "the model gave an ungrounded quote we dropped" from
            // "the model intentionally gave no quote" — the latter isn't a drop.
            outcome = "INSIGHT_QUOTE_DROPPED";
            console.info(
                "[coaching-insight] dropped an ungrounded quote; showing card without it",
            );
        }

        const whyTrimmed = (raw.why ?? "").trim();
        const why = whyTrimmed.length > 0 ? whyTrimmed : null;

        return { insight: { type, headline, quote, body, why }, outcome };
    } catch {
        return { insight: null, outcome: "INSIGHT_NULL" };
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
): LlmQualityOutcome[] {
    const outcomes = new Set<LlmQualityOutcome>();
    try {
        for (const t of analysis.turnRewrites ?? []) {
            // non_english entries are a verbatim passthrough of garbled
            // transcript text, not a rewrite — nothing to check.
            if (t.verdict === "non_english") continue;
            const token = findFabricatedToken([t.rewrite], transcript);
            if (token) {
                outcomes.add("FABRICATED_TURN_REWRITE");
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
                outcomes.add("FABRICATED_BETTER_OPTION");
                console.warn(
                    `[fabrication-telemetry] betterOption (anchor "${m.anchor.slice(0, 40)}") contains "${token}" not found in transcript`,
                );
            }
        }
    } catch {
        // Telemetry must never break analysis.
    }
    return [...outcomes];
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
    const runAnalysis = () =>
        generateText({
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

    // Skip telemetry for the admin reanalyze-insight preview so prompt-iteration
    // runs never land in production metrics; finalize() patches the quality
    // outcomes onto the event once we've computed them below.
    const record = input.telemetry?.record ?? true;
    let result: Awaited<ReturnType<typeof runAnalysis>>;
    let finalizeEvent: (patch: {
        qualityOutcomes?: LlmQualityOutcome[];
    }) => void = () => {};
    if (record) {
        const instrumented = await runInstrumentedLLM({
            promptKey: "capture.deep_analysis",
            model: modelName,
            promptParts,
            refs: {
                uid: input.telemetry?.uid ?? null,
                captureId: input.telemetry?.captureId ?? null,
            },
            call: runAnalysis,
        });
        result = instrumented.result;
        finalizeEvent = instrumented.finalize;
    } else {
        result = await runAnalysis();
    }

    const isUserLine = (line: CaptureTranscriptLine) => line.speaker === "user";

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
                .filter(
                    (ex): ex is { transcriptIdx: number; text: string } =>
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

    const insightResult = buildCoachingInsight(
        result.output.coachingInsight,
        result.output.hasCoachableEnglish,
        transcript,
    );

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
        coachingInsight: insightResult.insight,
    };

    const fabricationOutcomes = logFabricationTelemetry(analysis, transcript);

    // Floor: strip un-speakable punctuation (dashes everywhere; colons,
    // semicolons, brackets inside quoted spoken wording) from spoken
    // sub-fields (turnRewrites.rewrite, coachingInsight.body, every
    // betterOption). The prompt asks the model to avoid them; this
    // guarantees it. See lib/text/despeechify.ts.
    const sanitized = sanitizeSpokenFields(analysis);

    // Layer-2 quality outcomes: the signals that previously only hit
    // console.warn, recorded as enums on the telemetry event (transcript-free).
    const outcomes: LlmQualityOutcome[] = [];
    if (insightResult.outcome) outcomes.push(insightResult.outcome);
    outcomes.push(...fabricationOutcomes);
    if (turnRewrites.some((t) => t.verdict === "non_english")) {
        outcomes.push("NON_ENGLISH_PASSTHROUGH");
    }
    if (JSON.stringify(sanitized) !== JSON.stringify(analysis)) {
        outcomes.push("DESPEECHIFY_APPLIED");
    }
    finalizeEvent({ qualityOutcomes: outcomes });

    return {
        serverTitle: result.output.serverTitle,
        serverSummary: result.output.serverSummary,
        analysis: sanitized,
    };
}

// Exposed for unit tests only (mirrors lib/transcripts/anchor-resolver.ts).
export const __test = {
    buildCoachingInsight,
    enforceNonEnglishPassthrough,
    resolveInsightQuote,
    expandToCompleteThought,
    extractQuotedSpans,
    findFabricatedToken,
    isGenericInsightText,
};
