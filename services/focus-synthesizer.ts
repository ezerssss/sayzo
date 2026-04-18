import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { CaptureType } from "@/types/captures";
import type {
    FocusEvidence,
    FocusTheme,
    FocusThemeCategory,
    FocusWin,
    UserFocusInsights,
} from "@/types/focus-insights";
import type { SessionType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "focus");

/**
 * Threshold used by the cold-start path to decide between returning themes
 * versus an "insufficient data" empty state. Incremental updates inherit the
 * prior insight's `insufficientData` flag and let the LLM flip it once the
 * combined data clears the bar.
 */
const MIN_SESSIONS_FOR_THEMES = 2;
const MIN_CAPTURES_FOR_THEMES = 1;

/** Hard caps — more context costs more tokens and rarely adds signal past this. */
const MAX_SESSIONS_IN_CONTEXT = 30;
const MAX_CAPTURES_IN_CONTEXT = 10;
const MAX_TEACHABLE_MOMENTS_PER_CAPTURE = 6;
const MAX_FEEDBACK_EXCERPT_CHARS = 400;

const focusThemeCategorySchema = z.enum([
    "clarity",
    "directness",
    "structure",
    "delivery",
    "precision",
    "engagement",
]);

const focusEvidenceSchema = z.object({
    source: z.enum(["session", "capture"]),
    sourceId: z.string(),
    sourceTitle: z.string(),
    createdAt: z.string(),
    quote: z.string(),
    note: z.string(),
});

const focusThemeSchema = z.object({
    id: z.string(),
    title: z.string(),
    cost: z.string(),
    nudge: z.string(),
    category: focusThemeCategorySchema,
    isEmergent: z.boolean(),
    frequencySummary: z.string(),
    trend: z.enum(["new", "improving", "stable", "regressing"]),
    trendSummary: z.string(),
    evidence: z.array(focusEvidenceSchema),
    confidence: z.enum(["low", "medium", "high"]),
});

const focusWinSchema = z.object({
    statement: z.string(),
    lastSeen: focusEvidenceSchema.nullable(),
});

const focusSynthesisSchema = z.object({
    themes: z.array(focusThemeSchema),
    wins: z.array(focusWinSchema),
    overview: z.string(),
    insufficientData: z.boolean(),
});

type FocusUserProfileSlice = Pick<
    UserProfileType,
    | "role"
    | "industry"
    | "companyName"
    | "companyDescription"
    | "workplaceCommunicationContext"
    | "wantsInterviewPractice"
    | "motivation"
    | "goals"
    | "additionalContext"
>;

type FocusSkillMemorySlice = Pick<
    SkillMemoryType,
    "strengths" | "weaknesses" | "masteredFocus" | "reinforcementFocus"
>;

export type FocusSynthesizerInput = {
    userProfile: FocusUserProfileSlice;
    skillMemory: FocusSkillMemorySlice;
    /** All user sessions, newest first. Non-analyzed / replay-only sessions are filtered inside. */
    sessions: SessionType[];
    /** All user captures, newest first. Non-analyzed captures are filtered inside. */
    captures: CaptureType[];
};

/**
 * Incremental update input. `priorInsights` is carried forward as coaching
 * state and the LLM only sees the new activity — this is the steady-state
 * path and is intentionally cheap compared to the full cold-start
 * synthesizer.
 */
export type FocusIncrementalUpdaterInput = {
    userProfile: FocusUserProfileSlice;
    skillMemory: FocusSkillMemorySlice;
    priorInsights: UserFocusInsights;
    /** Only sessions with `analysis`, newest first, added since `priorInsights.lastSessionId`. */
    newSessions: SessionType[];
    /** Only captures with `analysis`, newest first, added since `priorInsights.lastCaptureId`. */
    newCaptures: CaptureType[];
};

export type FocusSynthesisResult = Omit<
    UserFocusInsights,
    "uid" | "generatedAt" | "updatedAt" | "version"
>;

function readPrompt(filename: "synthesize.md" | "update.md"): string {
    return readFileSync(join(PROMPTS_DIR, filename), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.FOCUS_SYNTHESIZER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function truncate(value: string, max: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function formatIsoDate(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso;
        return d.toISOString().slice(0, 10);
    } catch {
        return iso;
    }
}

function formatProfileBlock(profile: FocusUserProfileSlice): string {
    return `
## User profile
- Role: ${profile.role || "(not set)"}
- Industry: ${profile.industry || "(not set)"}
- Company: ${profile.companyName || "(not set)"}
- Company description: ${profile.companyDescription || "(not set)"}
- Workplace communication context: ${profile.workplaceCommunicationContext || "(not set)"}
- Wants interview practice: ${profile.wantsInterviewPractice ? "yes" : "no"}
- Motivation: ${profile.motivation || "(not set)"}
- Goals: ${profile.goals.length ? profile.goals.join("; ") : "(none)"}
- Additional context: ${profile.additionalContext?.trim() || "(none)"}
`.trim();
}

function formatMemoryBlock(memory: FocusSkillMemorySlice): string {
    return `
## Skill memory (prior belief)
- Strengths: ${memory.strengths.length ? memory.strengths.join("; ") : "(none)"}
- Weaknesses: ${memory.weaknesses.length ? memory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${memory.masteredFocus.length ? memory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${memory.reinforcementFocus.length ? memory.reinforcementFocus.join("; ") : "(none)"}
`.trim();
}

function condenseSession(session: SessionType): string | null {
    if (!session.analysis) return null;
    const analysis = session.analysis;
    const feedback = session.feedback;

    const parts: string[] = [];
    parts.push(
        `### Session ${session.id} — "${session.plan.scenario.title}" — ${formatIsoDate(session.createdAt)} — category: ${session.plan.scenario.category} — status: ${session.completionStatus}${session.type === "scenario_replay" ? " — scenario_replay" : ""}`,
    );
    if (analysis.mainIssue?.trim()) {
        parts.push(`Main issue: ${analysis.mainIssue.trim()}`);
    }
    if (analysis.secondaryIssues.length > 0) {
        parts.push(
            `Secondary: ${analysis.secondaryIssues.filter((s) => s.trim()).join("; ")}`,
        );
    }
    if (analysis.improvements.length > 0) {
        parts.push(
            `Improvements: ${analysis.improvements.filter((s) => s.trim()).join("; ")}`,
        );
    }
    if (analysis.regressions.length > 0) {
        parts.push(
            `Regressions: ${analysis.regressions.filter((s) => s.trim()).join("; ")}`,
        );
    }
    const dimensionalLines: string[] = [];
    if (analysis.structureAndFlow.length > 0)
        dimensionalLines.push(
            `- structure: ${analysis.structureAndFlow.join("; ")}`,
        );
    if (analysis.clarityAndConciseness.length > 0)
        dimensionalLines.push(
            `- clarity: ${analysis.clarityAndConciseness.join("; ")}`,
        );
    if (analysis.relevanceAndFocus.length > 0)
        dimensionalLines.push(
            `- relevance: ${analysis.relevanceAndFocus.join("; ")}`,
        );
    if (analysis.engagement.length > 0)
        dimensionalLines.push(`- engagement: ${analysis.engagement.join("; ")}`);
    if (analysis.professionalism.length > 0)
        dimensionalLines.push(
            `- professionalism: ${analysis.professionalism.join("; ")}`,
        );
    if (analysis.voiceToneExpression.length > 0)
        dimensionalLines.push(
            `- delivery: ${analysis.voiceToneExpression.join("; ")}`,
        );
    if (dimensionalLines.length > 0) {
        parts.push(`Dimensional findings:\n${dimensionalLines.join("\n")}`);
    }
    if (feedback) {
        const feedbackExcerpts: string[] = [];
        if (feedback.momentsToTighten?.trim()) {
            feedbackExcerpts.push(
                `- moments: ${truncate(feedback.momentsToTighten, MAX_FEEDBACK_EXCERPT_CHARS)}`,
            );
        }
        if (feedback.overview?.trim()) {
            feedbackExcerpts.push(
                `- overview: ${truncate(feedback.overview, MAX_FEEDBACK_EXCERPT_CHARS)}`,
            );
        }
        if (feedbackExcerpts.length > 0) {
            parts.push(`Feedback excerpts:\n${feedbackExcerpts.join("\n")}`);
        }
    }
    return parts.join("\n");
}

function condenseCapture(capture: CaptureType): string | null {
    if (!capture.analysis || !capture.id) return null;
    const analysis = capture.analysis;
    const title = capture.serverTitle ?? capture.title;

    const parts: string[] = [];
    parts.push(
        `### Capture ${capture.id} — "${title}" — ${formatIsoDate(capture.startedAt)}${
            typeof capture.durationSecs === "number"
                ? ` — duration: ${Math.round(capture.durationSecs)}s`
                : ""
        }`,
    );
    if (analysis.mainIssue?.trim()) {
        parts.push(`Main issue: ${analysis.mainIssue.trim()}`);
    }
    if (analysis.secondaryIssues.length > 0) {
        parts.push(
            `Secondary: ${analysis.secondaryIssues.filter((s) => s.trim()).join("; ")}`,
        );
    }
    if (analysis.improvements.length > 0) {
        parts.push(
            `Improvements: ${analysis.improvements.filter((s) => s.trim()).join("; ")}`,
        );
    }
    if (analysis.regressions.length > 0) {
        parts.push(
            `Regressions: ${analysis.regressions.filter((s) => s.trim()).join("; ")}`,
        );
    }
    const dimensionalLines: string[] = [];
    if (analysis.structureAndFlow.assessment?.trim())
        dimensionalLines.push(
            `- structure: ${analysis.structureAndFlow.assessment.trim()}`,
        );
    if (analysis.clarityAndConciseness.assessment?.trim())
        dimensionalLines.push(
            `- clarity: ${analysis.clarityAndConciseness.assessment.trim()}`,
        );
    if (analysis.relevanceAndFocus.assessment?.trim())
        dimensionalLines.push(
            `- relevance: ${analysis.relevanceAndFocus.assessment.trim()}`,
        );
    if (analysis.engagement.assessment?.trim())
        dimensionalLines.push(
            `- engagement: ${analysis.engagement.assessment.trim()}`,
        );
    if (analysis.professionalism.assessment?.trim())
        dimensionalLines.push(
            `- professionalism: ${analysis.professionalism.assessment.trim()}`,
        );
    if (analysis.voiceToneExpression.assessment?.trim())
        dimensionalLines.push(
            `- delivery: ${analysis.voiceToneExpression.assessment.trim()}`,
        );
    if (dimensionalLines.length > 0) {
        parts.push(`Dimensional assessments:\n${dimensionalLines.join("\n")}`);
    }

    const teachable = analysis.teachableMoments.slice(
        0,
        MAX_TEACHABLE_MOMENTS_PER_CAPTURE,
    );
    if (teachable.length > 0) {
        const lines = teachable.map(
            (m) =>
                `- [${m.type}/${m.severity}] "${truncate(m.anchor, 100)}" — ${truncate(m.whyIssue, 120)}`,
        );
        parts.push(`Teachable moments:\n${lines.join("\n")}`);
    }

    const fw = analysis.fillerWords;
    const topFillers = fw.breakdown
        .slice(0, 3)
        .map((b) => `${b.word} (${b.count})`)
        .join(", ");
    parts.push(
        `Filler rate: ${fw.perMinute.toFixed(1)}/min${topFillers ? ` — top: ${topFillers}` : ""}`,
    );
    const style = analysis.communicationStyle;
    parts.push(
        `Style: directness=${style.directness.toFixed(2)}, formality=${style.formality.toFixed(2)}, confidence=${style.confidence.toFixed(2)}, turn-taking=${style.turnTaking}`,
    );
    parts.push(
        `Fluency: WPM=${analysis.fluency.wordsPerMinute}, self-corrections=${analysis.fluency.selfCorrections}`,
    );

    return parts.join("\n");
}

function buildFullSynthesisMessage(input: FocusSynthesizerInput): {
    content: string;
    sessionsUsed: SessionType[];
    capturesUsed: CaptureType[];
} {
    const { userProfile, skillMemory, sessions, captures } = input;

    const analyzedSessions = sessions
        .filter((s) => !!s.analysis)
        .slice(0, MAX_SESSIONS_IN_CONTEXT);
    const analyzedCaptures = captures
        .filter((c) => !!c.analysis && !!c.id)
        .slice(0, MAX_CAPTURES_IN_CONTEXT);

    const sessionBlocks: string[] = [];
    for (const session of analyzedSessions) {
        const condensed = condenseSession(session);
        if (condensed) sessionBlocks.push(condensed);
    }
    const sessionsBlock = sessionBlocks.length
        ? `## Recent sessions (newest first)\n\n${sessionBlocks.join("\n\n")}`
        : `## Recent sessions\n(none analyzed yet)`;

    const captureBlocks: string[] = [];
    for (const capture of analyzedCaptures) {
        const condensed = condenseCapture(capture);
        if (condensed) captureBlocks.push(condensed);
    }
    const capturesBlock = captureBlocks.length
        ? `## Recent captures (newest first)\n\n${captureBlocks.join("\n\n")}`
        : `## Recent captures\n(none analyzed yet)`;

    const countsBlock = `
## Data volume
- Analyzed sessions considered: ${analyzedSessions.length}
- Analyzed captures considered: ${analyzedCaptures.length}
`.trim();

    const content = [
        formatProfileBlock(userProfile),
        formatMemoryBlock(skillMemory),
        countsBlock,
        sessionsBlock,
        capturesBlock,
    ].join("\n\n");

    return {
        content,
        sessionsUsed: analyzedSessions,
        capturesUsed: analyzedCaptures,
    };
}

function buildIncrementalUpdateMessage(
    input: FocusIncrementalUpdaterInput,
): { content: string; newSessionsUsed: SessionType[]; newCapturesUsed: CaptureType[] } {
    const { userProfile, skillMemory, priorInsights, newSessions, newCaptures } =
        input;

    const analyzedNewSessions = newSessions.filter((s) => !!s.analysis);
    const analyzedNewCaptures = newCaptures.filter(
        (c) => !!c.analysis && !!c.id,
    );

    // Strip metadata the LLM doesn't need to reproduce. Keep the coaching
    // content verbatim so themes preserve their ids and trend history.
    const priorView = {
        themes: priorInsights.themes,
        wins: priorInsights.wins,
        overview: priorInsights.overview,
        insufficientData: priorInsights.insufficientData,
    };

    const priorBlock = `
## Current focus view (prior belief — evolve this)
Prior totals: ${priorInsights.sessionsConsidered} drill(s), ${priorInsights.capturesConsidered} capture(s).

\`\`\`json
${JSON.stringify(priorView, null, 2)}
\`\`\`
`.trim();

    const newSessionBlocks: string[] = [];
    for (const session of analyzedNewSessions) {
        const condensed = condenseSession(session);
        if (condensed) newSessionBlocks.push(condensed);
    }
    const newSessionsBlock = newSessionBlocks.length
        ? `## New sessions since last update (newest first)\n\n${newSessionBlocks.join("\n\n")}`
        : `## New sessions since last update\n(none)`;

    const newCaptureBlocks: string[] = [];
    for (const capture of analyzedNewCaptures) {
        const condensed = condenseCapture(capture);
        if (condensed) newCaptureBlocks.push(condensed);
    }
    const newCapturesBlock = newCaptureBlocks.length
        ? `## New captures since last update (newest first)\n\n${newCaptureBlocks.join("\n\n")}`
        : `## New captures since last update\n(none)`;

    const content = [
        formatProfileBlock(userProfile),
        formatMemoryBlock(skillMemory),
        priorBlock,
        newSessionsBlock,
        newCapturesBlock,
    ].join("\n\n");

    return {
        content,
        newSessionsUsed: analyzedNewSessions,
        newCapturesUsed: analyzedNewCaptures,
    };
}

function normalizeWins(
    wins: { statement: string; lastSeen: FocusEvidence | null }[],
): FocusWin[] {
    return wins.map(({ statement, lastSeen }) =>
        lastSeen ? { statement, lastSeen } : { statement },
    );
}

function slugifyId(raw: string): string {
    return raw
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "_")
        .replaceAll(/_+/g, "_")
        .replaceAll(/^_+|_+$/g, "")
        .slice(0, 60);
}

/**
 * Dedupe themes by backbone category + clamp evidence / theme counts. The
 * model is instructed to do this, but we enforce as a belt and suspenders so
 * a bad generation can't produce a broken UI.
 */
function normalizeThemes(themes: FocusTheme[]): FocusTheme[] {
    const seenBackboneCategories = new Set<FocusThemeCategory>();
    const seenIds = new Set<string>();
    const out: FocusTheme[] = [];
    for (const theme of themes) {
        if (!theme.isEmergent) {
            if (seenBackboneCategories.has(theme.category)) continue;
            seenBackboneCategories.add(theme.category);
        }
        let id = theme.id?.trim() ? slugifyId(theme.id) : "";
        if (!id) {
            id = theme.isEmergent
                ? slugifyId(theme.title)
                : theme.category;
        }
        if (seenIds.has(id)) {
            id = `${id}_${out.length + 1}`;
        }
        seenIds.add(id);
        out.push({
            ...theme,
            id,
            evidence: theme.evidence.slice(0, 5),
        });
        if (out.length >= 5) break;
    }
    return out;
}

/**
 * Cold-start synthesis. Use when no prior insights exist, when schema version
 * has changed, or when a caller explicitly requests a rebuild. Expensive
 * relative to `updateFocusInsightsIncremental` — prefer that path whenever
 * prior insights exist.
 */
export async function synthesizeFocusInsights(
    input: FocusSynthesizerInput,
): Promise<FocusSynthesisResult> {
    const { content, sessionsUsed, capturesUsed } =
        buildFullSynthesisMessage(input);

    const insufficient =
        sessionsUsed.length < MIN_SESSIONS_FOR_THEMES &&
        capturesUsed.length < MIN_CAPTURES_FOR_THEMES;

    const lastSessionId = sessionsUsed[0]?.id ?? "";
    const lastCaptureId = capturesUsed[0]?.id ?? "";

    if (insufficient) {
        return {
            themes: [],
            wins: [],
            overview: "",
            insufficientData: true,
            sessionsConsidered: sessionsUsed.length,
            capturesConsidered: capturesUsed.length,
            lastSessionId,
            lastCaptureId,
        };
    }

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(focusSynthesisSchema),
            name: "UserFocusSynthesis",
            description:
                "Unified coaching view across recent drills and captures — themes, wins, and overview.",
        }),
        system: readPrompt("synthesize.md"),
        prompt: content,
        temperature: 0.3,
    });

    const raw = result.output;
    const themes = normalizeThemes(raw.themes).slice(0, 5);

    return {
        themes,
        wins: normalizeWins(raw.wins).slice(0, 5),
        overview: raw.overview.trim(),
        insufficientData: raw.insufficientData && themes.length === 0,
        sessionsConsidered: sessionsUsed.length,
        capturesConsidered: capturesUsed.length,
        lastSessionId,
        lastCaptureId,
    };
}

/**
 * Incremental refresh. Carries the prior `UserFocusInsights` forward as state
 * and only feeds the LLM the new sessions/captures added since the last
 * synthesis. Steady-state cost — typically a few thousand input tokens —
 * which is the point of this path.
 *
 * Callers must pre-filter `newSessions` and `newCaptures` to items not yet
 * considered by `priorInsights` (i.e. newer than `lastSessionId` /
 * `lastCaptureId`). This function trusts that filter.
 */
export async function updateFocusInsightsIncremental(
    input: FocusIncrementalUpdaterInput,
): Promise<FocusSynthesisResult> {
    const { priorInsights } = input;
    const { content, newSessionsUsed, newCapturesUsed } =
        buildIncrementalUpdateMessage(input);

    const updatedSessionsConsidered =
        priorInsights.sessionsConsidered + newSessionsUsed.length;
    const updatedCapturesConsidered =
        priorInsights.capturesConsidered + newCapturesUsed.length;

    const nextLastSessionId =
        newSessionsUsed[0]?.id ?? priorInsights.lastSessionId;
    const nextLastCaptureId =
        newCapturesUsed[0]?.id ?? priorInsights.lastCaptureId;

    // No new activity — no need to spend tokens re-evaluating unchanged state.
    // Return the prior view with updated metadata only.
    if (newSessionsUsed.length === 0 && newCapturesUsed.length === 0) {
        return {
            themes: priorInsights.themes,
            wins: priorInsights.wins,
            overview: priorInsights.overview,
            insufficientData: priorInsights.insufficientData,
            sessionsConsidered: updatedSessionsConsidered,
            capturesConsidered: updatedCapturesConsidered,
            lastSessionId: nextLastSessionId,
            lastCaptureId: nextLastCaptureId,
        };
    }

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(focusSynthesisSchema),
            name: "UserFocusSynthesisUpdate",
            description:
                "Updated coaching view evolving the prior focus view with new drills and captures.",
        }),
        system: readPrompt("update.md"),
        prompt: content,
        temperature: 0.3,
    });

    const raw = result.output;
    const themes = normalizeThemes(raw.themes).slice(0, 5);

    // If the LLM flipped `insufficientData` back on despite producing themes,
    // trust the themes — same belt-and-suspenders as the cold path.
    const combinedBelowThreshold =
        updatedSessionsConsidered < MIN_SESSIONS_FOR_THEMES &&
        updatedCapturesConsidered < MIN_CAPTURES_FOR_THEMES;
    const insufficientData =
        (raw.insufficientData && themes.length === 0) ||
        (combinedBelowThreshold && themes.length === 0);

    return {
        themes,
        wins: normalizeWins(raw.wins).slice(0, 5),
        overview: raw.overview.trim(),
        insufficientData,
        sessionsConsidered: updatedSessionsConsidered,
        capturesConsidered: updatedCapturesConsidered,
        lastSessionId: nextLastSessionId,
        lastCaptureId: nextLastCaptureId,
    };
}
