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
    const recentDrillsBlock =
        recentDrills.length === 0
            ? "(none yet — first drills for this learner)"
            : recentDrills
                  .map(
                      (d, i) =>
                          `${i + 1}. category=${d.category}; scenario title=${d.scenarioTitle}; skill target=${d.skillTarget}`,
                  )
                  .join("\n");
    return `
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
${internalCtx || "(none yet — nothing merged from past transcripts)"}

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

    const maxDurationSeconds = Math.max(
        120,
        Math.min(1800, Math.round(plan.maxDurationSeconds || 0)),
    );

    return {
        scenario: {
            title: plan.scenario.title.trim(),
            situationContext: plan.scenario.situationContext.trim(),
            givenContent: plan.scenario.givenContent.trim(),
            framework: plan.scenario.framework.trim(),
            category: toDrillCategorySlug(plan.scenario.category),
        },
        skillTarget,
        maxDurationSeconds,
    };
}

export async function planNextSession(input: PlannerInput): Promise<SessionPlanType> {
    const result = await generateText({
        model: openai(defaultPlannerModel()),
        output: Output.object({
            schema: zodSchema(sessionPlanSchema),
            name: "SessionPlan",
            description: "One focused speaking drill plan for the next session.",
        }),
        system: readPlannerPrompt(),
        prompt: plannerUserMessage(input),
        temperature: 0.25,
    });

    return normalizePlan(result.output);
}

export function buildSessionFromPlan(uid: string, plan: SessionPlanType): SessionType {
    return {
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
}

