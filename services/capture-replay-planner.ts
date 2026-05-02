import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
    CaptureType,
} from "@/types/captures";
import {
    toDrillCategorySlug,
    type SessionPlanType,
} from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "planner");

// Same Zod shape as the regular planner — kept local so this module is
// independent and the regular planner stays unaware of captures.
// Category is lenient here (just a string) — normalizePlan() handles
// slug conversion after. The strict Zod chain from the regular planner
// rejects garbled output from smaller models before we can fix it.
const sessionPlanSchema = z.object({
    scenario: z.object({
        title: z.string(),
        situationContext: z.string(),
        givenContent: z.string(),
        question: z.string(),
        framework: z.string(),
        category: z.string(),
    }),
    skillTarget: z.string(),
    maxDurationSeconds: z.number(),
});

export type CaptureReplayPlannerInput = {
    capture: CaptureType;
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
    skillMemory: Pick<
        SkillMemoryType,
        "strengths" | "weaknesses" | "masteredFocus" | "reinforcementFocus"
    >;
};

function readReplayPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "replay-from-capture.md"), "utf-8");
}

function defaultPlannerModel(): string {
    return (
        process.env.PLANNER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function formatTranscript(transcript: CaptureTranscriptLine[]): string {
    return transcript
        .map(
            (line, idx) =>
                `[${idx}] [${line.start.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");
}

function findingWhy(finding: {
    whyThisMatters?: string;
    whyIssue?: string;
}): string {
    return (finding.whyThisMatters ?? finding.whyIssue ?? "").trim();
}

function formatDimensionalAssessment(
    label: string,
    dim: {
        assessment: string;
        findings: {
            anchor: string;
            whyThisMatters?: string;
            whyIssue?: string;
        }[];
    },
): string {
    const assessment = dim.assessment.trim();
    const topFinding = dim.findings[0];
    if (!assessment && !topFinding) return `- ${label}: (no issues flagged)`;
    const parts: string[] = [];
    if (assessment) parts.push(assessment);
    if (topFinding) {
        parts.push(
            `(top issue: ${topFinding.anchor.trim()} — ${findingWhy(topFinding)})`,
        );
    }
    return `- ${label}: ${parts.join(" ")}`;
}

function formatTeachableMoments(analysis: CaptureAnalysis): string {
    const moments = [
        ...(analysis.fixTheseFirst ?? []),
        ...(analysis.moreMoments ?? []),
    ].slice(0, 6);
    if (moments.length === 0) return "(none flagged)";
    return moments
        .map(
            (m, i) =>
                `${i + 1}. [idx ${m.transcriptIdx}, ${m.severity}] anchor: ${m.anchor.trim()} | why: ${findingWhy(m)} | better: ${m.betterOption.trim()}`,
        )
        .join("\n");
}

function buildReplayUserMessage(input: CaptureReplayPlannerInput): string {
    const { capture, userProfile, skillMemory } = input;
    const transcript = capture.serverTranscript ?? capture.agentTranscript;
    const title = capture.serverTitle ?? capture.title;
    const summary = capture.serverSummary ?? capture.summary;
    const analysis = capture.analysis;

    const analysisBlock = analysis
        ? `## Capture analysis (use this to choose the framework and skillTarget)
- Main issue: ${analysis.mainIssue}
- Secondary issues: ${analysis.secondaryIssues.join("; ") || "(none)"}

### Dimensional assessments
${formatDimensionalAssessment("Structure & flow", analysis.structureAndFlow)}
${formatDimensionalAssessment("Clarity & conciseness", analysis.clarityAndConciseness)}
${formatDimensionalAssessment("Relevance & focus", analysis.relevanceAndFocus)}
${formatDimensionalAssessment("Engagement", analysis.engagement)}
${formatDimensionalAssessment("Professionalism", analysis.professionalism)}
${formatDimensionalAssessment("Voice / tone / expression", analysis.voiceToneExpression)}

### Top teachable moments (transcript-anchored)
${formatTeachableMoments(analysis)}`
        : "## Capture analysis\n(none — capture has no analysis yet)";

    return `## User profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Company description: ${userProfile.companyDescription || "(not set)"}
- Workplace communication context: ${userProfile.workplaceCommunicationContext || "(not set)"}
- Motivation: ${userProfile.motivation || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Skill memory
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${skillMemory.masteredFocus.length ? skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${skillMemory.reinforcementFocus.length ? skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Source capture (the real conversation the learner already had)
Title: ${title}
Summary: ${summary}
Duration: ~${Math.round(capture.durationSecs ?? 0)} seconds

${analysisBlock}

### Full transcript (indexed, speaker-tagged — \`user\` is the learner)
${formatTranscript(transcript)}
`.trim();
}

function normalizePlan(plan: SessionPlanType): SessionPlanType {
    const skillTarget = plan.skillTarget.trim() || "Structured speaking";

    // Bite-sized replay: same 60s cap as the main planner. Enforce here even
    // if the LLM ignores instructions — replays must fit the new drill shape.
    const maxDurationSeconds = Math.max(
        30,
        Math.min(60, Math.round(plan.maxDurationSeconds || 60)),
    );

    // Category may be garbled by smaller models — truncate to first valid
    // slug-like portion, then normalize. Fall back to "status_update" if
    // nothing salvageable (safest generic default for work conversations).
    let rawCategory = plan.scenario.category ?? "";
    // Strip anything after the first non-slug character (quotes, commas, etc.)
    const slugMatch = /^[a-zA-Z][a-zA-Z0-9_ ]*/.exec(rawCategory);
    rawCategory = slugMatch ? slugMatch[0].trim() : "status_update";
    const category = toDrillCategorySlug(rawCategory) || "status_update";

    return {
        scenario: {
            title: plan.scenario.title.trim(),
            situationContext: plan.scenario.situationContext.trim(),
            // 60s replays always have empty given content — the prompt is the whole experience.
            givenContent: "",
            question: plan.scenario.question?.trim() ?? "",
            framework: plan.scenario.framework.trim(),
            category,
        },
        skillTarget,
        maxDurationSeconds,
    };
}

/**
 * Plan a scenario-replay drill from a captured real conversation.
 *
 * Uses a dedicated prompt (`prompts/planner/replay-from-capture.md`) so the
 * regular planner stays unaware of captures. The output is the same
 * `SessionPlanType` shape as `planNextSession` so the rest of the drill
 * pipeline (build → record → analyze → feedback) works unchanged.
 */
export async function planScenarioReplayFromCapture(
    input: CaptureReplayPlannerInput,
): Promise<SessionPlanType> {
    const result = await generateText({
        model: openai(defaultPlannerModel()),
        output: Output.object({
            schema: zodSchema(sessionPlanSchema),
            name: "ScenarioReplayPlan",
            description:
                "A practice drill plan derived from a real captured conversation, designed to let the learner re-do the same situation with better delivery.",
        }),
        system: readReplayPrompt(),
        prompt: buildReplayUserMessage(input),
        temperature: 0.25,
    });

    return normalizePlan(result.output);
}
