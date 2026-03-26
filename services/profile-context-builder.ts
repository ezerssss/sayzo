import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "profile-builder");

/** Profile fields produced from onboarding; merge with `uid`, timestamps, etc. when saving. */
const userProfileFieldsSchema = z.object({
    role: z.string().describe("Professional role / function from user input."),
    industry: z
        .string()
        .describe(
            "Industry or sector only if clearly stated by the user; otherwise empty string.",
        ),
    goals: z
        .array(z.string())
        .describe(
            "Professional English / communication goals from onboarding.",
        ),
    companyName: z
        .string()
        .describe("Employer or organization name if provided, else empty string."),
    companyDescription: z
        .string()
        .describe("Short plain-English description of what the company does."),
    workplaceCommunicationContext: z
        .string()
        .describe(
            "Specific situations where the user uses English at work and who they communicate with.",
        ),
    motivation: z
        .string()
        .describe("Why the user wants to improve professional English now."),
    additionalContext: z
        .string()
        .describe(
            "Pain points, free-text notes, and other user-provided context not stored in role/industry/goals.",
        ),
});

export type UserProfileFieldsFromAI = Pick<
    UserProfileType,
    | "role"
    | "industry"
    | "goals"
    | "companyName"
    | "companyDescription"
    | "workplaceCommunicationContext"
    | "motivation"
    | "additionalContext"
>;

export type ProfileContextBuilderInput = {
    role: string;
    companyName?: string;
    companyContext?: string;
    goals: string[];
    goalsFreeText?: string;
    motivation?: string;
    painPoints?: string[];
    painFreeText?: string;
    additionalContext?: string;
};

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "build-context.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.PROFILE_BUILDER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function buildUserMessage(input: ProfileContextBuilderInput): string {
    const goalsSection = input.goals.length
        ? input.goals.map((g) => `- ${g}`).join("\n")
        : "(none)";
    const painsSection =
        input.painPoints?.length && input.painPoints.length > 0
            ? input.painPoints.map((p) => `- ${p}`).join("\n")
            : "(none)";

    return `
## Role (raw)
${input.role.trim() || "(empty)"}

## Company name (raw)
${(input.companyName ?? "").trim() || "(empty)"}

## Company context (raw)
${(input.companyContext ?? "").trim() || "(empty)"}

## Goals (selected chips)
${goalsSection}

## Goals (free text)
${input.goalsFreeText?.trim() || "(none)"}

## Motivation (raw)
${input.motivation?.trim() || "(none)"}

## Pain / difficulty (selected chips)
${painsSection}

## Pain / difficulty (free text)
${input.painFreeText?.trim() || "(none)"}

## Additional context (raw)
${input.additionalContext?.trim() || "(none)"}
`.trim();
}

function requireMinimumInput(input: ProfileContextBuilderInput): void {
    const hasAny =
        input.role.trim() ||
        (input.companyName ?? "").trim() ||
        (input.companyContext ?? "").trim() ||
        input.goals.length > 0 ||
        input.goalsFreeText?.trim() ||
        input.motivation?.trim() ||
        input.painPoints?.length ||
        input.painFreeText?.trim() ||
        input.additionalContext?.trim();

    if (!hasAny) {
        throw new Error(
            "ProfileContextBuilder requires at least one non-empty onboarding field.",
        );
    }
}

/**
 * Maps raw onboarding answers into normalized profile fields on `UserProfileType`.
 * Returned object is JSON-serializable.
 */
export async function buildUserProfileFieldsFromOnboarding(
    input: ProfileContextBuilderInput,
): Promise<UserProfileFieldsFromAI> {
    requireMinimumInput(input);

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(userProfileFieldsSchema),
            name: "UserProfileFields",
            description:
                "JSON object with keys: role, industry, goals, additionalContext — normalized user profile slice.",
        }),
        system: readPrompt(),
        prompt: buildUserMessage(input),
        temperature: 0.2,
    });

    return result.output;
}
