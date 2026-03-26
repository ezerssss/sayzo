import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionPlanType, SessionType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "planner");

const sessionPlanSchema = z.object({
    scenario: z.object({
        title: z.string(),
        situationContext: z.string(),
        givenContent: z.string(),
        framework: z.string(),
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
        | "motivation"
        | "additionalContext"
        | "companyResearch"
    >;
    skillMemory: Pick<
        SkillMemoryType,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >;
};

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
    const { userProfile, skillMemory } = input;
    return `
## User profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Company description: ${userProfile.companyDescription || "(not set)"}
- Workplace communication context: ${userProfile.workplaceCommunicationContext || "(not set)"}
- Motivation: ${userProfile.motivation || "(not set)"}
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

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
        transcript: null,
        analysis: null,
        feedback: null,
        completionStatus: "pending",
        completionReason: null,
        createdAt: new Date().toISOString(),
    };
}

