import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import {
    toDrillCategorySlug,
    type PlannerRecentDrillSummary,
    type SessionPlanType,
    type SessionType,
} from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "planner");

/** How many past drills (newest first) are summarized for the planner prompt. */
export const PLANNER_RECENT_DRILLS_LOOKBACK = 8;

const drillCategorySchema = z
    .string()
    .min(1)
    .max(96)
    .transform(toDrillCategorySlug)
    .pipe(
        z
            .string()
            .min(2, "category slug too short")
            .max(64, "category slug too long")
            .regex(
                /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
                "Use a short snake_case slug (letters, digits, underscores; start with a letter)",
            ),
    );

const sessionPlanSchema = z.object({
    scenario: z.object({
        title: z.string(),
        situationContext: z.string(),
        givenContent: z.string(),
        question: z.string(),
        framework: z.string(),
        category: drillCategorySchema,
    }),
    skillTarget: z.string(),
    maxDurationSeconds: z.number(),
});

export type PlannerInput = {
    userProfile: Pick<
        UserProfileType,
        | "role"
        | "industry"
        | "goals"
        | "companyName"
        | "companyDescription"
        | "workplaceCommunicationContext"
        | "wantsInterviewPractice"
        | "motivation"
        | "additionalContext"
        | "companyResearch"
        | "internalLearnerContext"
        | "internalCaptureContext"
        | "internalCaptureDeliveryNotes"
    >;
    skillMemory: Pick<
        SkillMemoryType,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >;
    /** Newest first; same length cap as `PLANNER_RECENT_DRILLS_LOOKBACK` from the API. */
    recentDrills: PlannerRecentDrillSummary[];
    /** Optional: user-requested drill category slug. The planner MUST use this category. */
    requestedCategory?: string;
};

export function summarizeSessionsForPlanner(
    sessions: SessionType[],
): PlannerRecentDrillSummary[] {
    return sessions.map((s) => ({
        category: s.plan?.scenario?.category?.trim() || "unknown",
        scenarioTitle: s.plan?.scenario?.title?.trim() || "(untitled)",
        skillTarget: s.plan?.skillTarget?.trim() || "(none)",
    }));
}

function readPlannerPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "create-session-plan.md"), "utf-8");
}

type SeedPrompt = {
    category: string;
    title: string;
    question: string;
    skillTarget: string;
    framework: string;
};

let cachedSeedLibrary: SeedPrompt[] | null = null;

function readSeedLibrary(): SeedPrompt[] {
    if (cachedSeedLibrary) return cachedSeedLibrary;
    const raw = readFileSync(
        join(PROMPTS_DIR, "seed-prompt-library.json"),
        "utf-8",
    );
    cachedSeedLibrary = JSON.parse(raw) as SeedPrompt[];
    return cachedSeedLibrary;
}

/**
 * A small rotating sample of seed prompts for few-shot shaping. Picks one per
 * category (up to ~8) so the planner sees variety without flooding the
 * context window. Random-ish rotation prevents the planner from anchoring on
 * the first example.
 */
function pickSeedExamples(category?: string): SeedPrompt[] {
    const library = readSeedLibrary();
    const byCategory = new Map<string, SeedPrompt[]>();
    for (const seed of library) {
        const arr = byCategory.get(seed.category) ?? [];
        arr.push(seed);
        byCategory.set(seed.category, arr);
    }
    const picks: SeedPrompt[] = [];
    for (const [, arr] of byCategory) {
        const idx = Math.floor(Math.random() * arr.length);
        const seed = arr[idx];
        if (seed) picks.push(seed);
    }
    if (category) {
        const cat = category.trim();
        const matches = library.filter((s) => s.category === cat);
        if (matches.length > 0) {
            const extra =
                matches[Math.floor(Math.random() * matches.length)];
            if (extra && !picks.includes(extra)) picks.push(extra);
        }
    }
    return picks;
}

function isFirstDrillForLearner(input: PlannerInput): boolean {
    const noContext =
        !input.userProfile.internalLearnerContext?.trim();
    const noHistory = input.recentDrills.length === 0;
    return noContext && noHistory;
}

function defaultPlannerModel(): string {
    return (
        process.env.PLANNER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function plannerUserMessage(input: PlannerInput): string {
    const { userProfile, skillMemory, recentDrills } = input;
    const internalCtx = userProfile.internalLearnerContext.trim() || "";
    const captureContext =
        (userProfile.internalCaptureContext ?? "").trim() || "";
    const captureDeliveryNotes =
        (userProfile.internalCaptureDeliveryNotes ?? "").trim() || "";
    const recentDrillsBlock =
        recentDrills.length === 0
            ? "(none yet — first drills for this learner)"
            : recentDrills
                  .map(
                      (d, i) =>
                          `${i + 1}. category=${d.category}; scenario title=${d.scenarioTitle}; skill target=${d.skillTarget}`,
                  )
                  .join("\n");
    const requestedCategoryBlock = input.requestedCategory
        ? `\n## Requested category (MUST use)\nThe user has specifically requested a drill of type: \`${input.requestedCategory}\`. You MUST set \`scenario.category\` to this value. Design the drill around this category while still respecting skill memory and user profile.\n`
        : "";

    return `${requestedCategoryBlock}
## User profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Company description: ${userProfile.companyDescription || "(not set)"}
- Workplace communication context: ${userProfile.workplaceCommunicationContext || "(not set)"}
- Wants interview practice: ${userProfile.wantsInterviewPractice ? "yes" : "no"}
- Motivation: ${userProfile.motivation || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Accumulated learner context (backend only — never show to the user)
${internalCtx || "(none yet — nothing merged from past drill transcripts)"}

## Real-conversation capture context (backend only — extracted from real meetings/calls; never show to the user)
${captureContext || "(none — no real-conversation captures processed yet)"}

## Real-conversation delivery notes (backend only — HOW the user actually speaks in real life; never show to the user)
${captureDeliveryNotes || "(none — no real-conversation captures processed yet)"}

## Company grounding (for realism)
- Confidence: ${userProfile.companyResearch?.confidence ?? "(none)"}
- Research summary: ${userProfile.companyResearch?.summary ?? "(none)"}
- Key products: ${
        userProfile.companyResearch?.keyProducts?.length
            ? userProfile.companyResearch.keyProducts.join("; ")
            : "(none)"
    }
- Key features: ${
        userProfile.companyResearch?.keyFeatures?.length
            ? userProfile.companyResearch.keyFeatures.join("; ")
            : "(none)"
    }
- Target customers: ${
        userProfile.companyResearch?.targetCustomers?.length
            ? userProfile.companyResearch.targetCustomers.join("; ")
            : "(none)"
    }
- Domain signals: ${
        userProfile.companyResearch?.domainSignals?.length
            ? userProfile.companyResearch.domainSignals.join("; ")
            : "(none)"
    }
- Supplemental facts: ${
        userProfile.companyResearch?.supplementalFacts?.length
            ? userProfile.companyResearch.supplementalFacts.join("; ")
            : "(none)"
    }
- Grounded facts: ${
        userProfile.companyResearch?.groundedFacts?.length
            ? userProfile.companyResearch.groundedFacts.join("; ")
            : "(none)"
    }
- Unknowns: ${
        userProfile.companyResearch?.unknowns?.length
            ? userProfile.companyResearch.unknowns.join("; ")
            : "(none)"
    }
- Sources: ${
        userProfile.companyResearch?.sources?.length
            ? userProfile.companyResearch.sources.join("; ")
            : "(none)"
    }

## Skill memory
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${skillMemory.masteredFocus.length ? skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${skillMemory.reinforcementFocus.length ? skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Recent drills (newest first)
${recentDrillsBlock}
`.trim();
}

function normalizePlan(plan: SessionPlanType): SessionPlanType {
    const skillTarget = plan.skillTarget.trim() || "Structured speaking";

    // Bite-sized drills: hard cap at 60s, never less than 30s.
    const maxDurationSeconds = Math.max(
        30,
        Math.min(60, Math.round(plan.maxDurationSeconds || 60)),
    );

    return {
        scenario: {
            title: plan.scenario.title.trim(),
            situationContext: plan.scenario.situationContext.trim(),
            // 60s drills always have empty given content — the prompt is the whole experience.
            givenContent: "",
            question: plan.scenario.question?.trim() ?? "",
            framework: plan.scenario.framework.trim(),
            category: toDrillCategorySlug(plan.scenario.category),
        },
        skillTarget,
        maxDurationSeconds,
    };
}

function buildSeedExamplesBlock(input: PlannerInput): string {
    const examples = pickSeedExamples(input.requestedCategory);
    if (examples.length === 0) return "";
    const formatted = examples
        .map(
            (s, i) =>
                `${i + 1}. category=${s.category} | title="${s.title}" | question="${s.question}" | skillTarget="${s.skillTarget}" | framework="${s.framework}"`,
        )
        .join("\n");
    const coldStartHint = isFirstDrillForLearner(input)
        ? "\n\nThis is the learner's first regular drill (no history yet, no merged context). It's safe — and preferred — to pick one of these seeds and lightly adjust pronouns/role to fit the user, rather than inventing a new prompt from scratch."
        : "";
    return `\n\n## Seed prompts (60-second shape examples — use as few-shot calibration)\n${formatted}${coldStartHint}\n`;
}

export async function planNextSession(input: PlannerInput): Promise<SessionPlanType> {
    const result = await generateText({
        model: openai(defaultPlannerModel()),
        output: Output.object({
            schema: zodSchema(sessionPlanSchema),
            name: "SessionPlan",
            description: "One focused 60-second speaking drill plan for the next session.",
        }),
        system: readPlannerPrompt(),
        prompt: `${plannerUserMessage(input)}${buildSeedExamplesBlock(input)}`,
        temperature: 0.25,
    });

    return normalizePlan(result.output);
}

export type BuildSessionOptions = {
    /** When set, the new session is linked back to the source capture for
     * the "Practice this conversation" replay flow. */
    sourceCaptureId?: string;
    /** Defaults to `"drill"`. Set to `"scenario_replay"` for capture replays. */
    type?: "drill" | "scenario_replay";
};

export function buildSessionFromPlan(
    uid: string,
    plan: SessionPlanType,
    options?: BuildSessionOptions,
): SessionType {
    const session: SessionType = {
        id: randomUUID(),
        uid,
        plan,
        audioUrl: null,
        audioObjectPath: null,
        transcript: null,
        analysis: null,
        feedback: null,
        completionStatus: "pending",
        completionReason: null,
        processingStatus: "idle",
        processingStage: null,
        processingJobId: null,
        processingError: null,
        processingUpdatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
    };

    if (options?.sourceCaptureId) {
        session.sourceCaptureId = options.sourceCaptureId;
    }
    if (options?.type) {
        session.type = options.type;
    }

    return session;
}

