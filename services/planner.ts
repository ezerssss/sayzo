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
        task: z.string(),
    }),
    focus: z.array(z.string()),
});

export type PlannerInput = {
    userProfile: Pick<
        UserProfileType,
        "role" | "industry" | "goals" | "additionalContext"
    >;
    skillMemory: Pick<
        SkillMemoryType,
        "strengths" | "weaknesses" | "recentFocus"
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
- Goals: ${userProfile.goals.length ? userProfile.goals.join("; ") : "(none)"}
- Additional context: ${userProfile.additionalContext?.trim() || "(none)"}

## Skill memory
- Strengths: ${skillMemory.strengths.length ? skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${skillMemory.weaknesses.length ? skillMemory.weaknesses.join("; ") : "(none)"}
- Recent focus: ${skillMemory.recentFocus.length ? skillMemory.recentFocus.join("; ") : "(none)"}
`.trim();
}

function normalizePlan(plan: SessionPlanType): SessionPlanType {
    const focus = Array.from(
        new Set(
            plan.focus
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
        ),
    ).slice(0, 2);

    return {
        scenario: {
            title: plan.scenario.title.trim(),
            situationContext: plan.scenario.situationContext.trim(),
            givenContent: plan.scenario.givenContent.trim(),
            task: plan.scenario.task.trim(),
        },
        focus,
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
        createdAt: new Date().toISOString(),
    };
}

