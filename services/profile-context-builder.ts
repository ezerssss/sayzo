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
    employmentStatus: z
        .enum(["employed", "unemployed"])
        .describe(
            "Whether the user is currently employed or job-seeking, inferred from their speaking samples.",
        ),
    wantsInterviewPractice: z
        .boolean()
        .describe(
            "Whether the user wants interview practice, inferred from mentions of interviews, job searching, or career transitions.",
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
    | "employmentStatus"
    | "wantsInterviewPractice"
>;

/** Legacy input shape — kept for backward compatibility. */
export type ProfileContextBuilderInput = {
    role: string;
    employmentStatus: "employed" | "unemployed";
    companyName?: string;
    companyContext?: string;
    goals: string[];
    goalsFreeText?: string;
    motivation?: string;
    painPoints?: string[];
    painFreeText?: string;
    additionalContext?: string;
};

export type OnboardingDrillTranscript = {
    drillType: "self_introduction" | "workplace_scenario" | "challenge_moment";
    transcript: string;
};

export type DrillBasedProfileInput = {
    drills: OnboardingDrillTranscript[];
    /** Optional: voice expression analysis from Hume */
    humeContext?: string | null;
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

## Employment status (raw)
${input.employmentStatus}

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

function buildDrillBasedUserMessage(input: DrillBasedProfileInput): string {
    const drillSections = input.drills
        .map((d) => {
            const label =
                d.drillType === "self_introduction"
                    ? "Self-introduction drill"
                    : d.drillType === "workplace_scenario"
                      ? "Workplace communication drill"
                      : "Challenge / difficulty drill";
            return `## ${label}\n${d.transcript.trim() || "(empty)"}`;
        })
        .join("\n\n");

    const humeSection = input.humeContext?.trim()
        ? `\n\n## Voice expression analysis\n${input.humeContext}`
        : "";

    return `The following are transcripts from 3 onboarding speaking drills. Extract the user's professional profile from what they said.

${drillSections}${humeSection}`;
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

const DRILL_BASED_SYSTEM_PROMPT = `You are the **profile field mapper** for Eloquy. You **do not** coach, analyze sessions, or add opinions. You only **extract and normalize** a user's professional profile from their onboarding speaking drill transcripts into a single **JSON-shaped** user profile slice that matches the product schema.

### Required JSON output (exact keys)

The model must produce a **JSON object** with **only** these fields (same names, same types):

| Field | Type | Meaning |
|-------|------|--------|
| \`role\` | string | What they do professionally (current role or target role), polished from their words. |
| \`industry\` | string | Sector or domain inferred from the transcripts if reasonably clear; otherwise \`""\`. |
| \`goals\` | string[] | What they want to improve in **professional/interview English**; inferred from their self-introduction (why they're here), workplace situations they describe, and challenges they mention. |
| \`companyName\` | string | Employer or target organization name from user's words; \`""\` if not mentioned. |
| \`companyDescription\` | string | What the company or target organization/domain does, in one concise sentence inferred from context. |
| \`workplaceCommunicationContext\` | string | Where/with whom they need English (work meetings, clients, interviewers, etc.), inferred from their workplace drill. |
| \`motivation\` | string | Why they want to improve now, inferred from their self-introduction and challenge descriptions. |
| \`additionalContext\` | string | Pain points, challenges, and context not captured in other fields. Combine the difficulty/challenge drill insights here. Use \`""\` only if there is truly nothing beyond other fields. |
| \`employmentStatus\` | "employed" \\| "unemployed" | Whether the user is currently employed or job-seeking, inferred from their speaking. Default to "employed" if unclear. |
| \`wantsInterviewPractice\` | boolean | Whether the user wants interview practice. True if they mention interviews, job searching, career changes, or preparing for new roles. Default false if unclear. |

### Rules

- **Ground truth = what the user said in their drills.** Do not invent companies, years of experience, languages, or situations that are not supported by the transcripts.
- You **may** lightly edit phrasing for clarity (grammar, redundancy), but **do not** add new facts.
- If **industry** is unclear from context, output \`""\`.
- \`goals\` should stay **specific** to communication/speaking goals they expressed or implied, not generic life advice.
- For the challenge/difficulty drill, extract pain points and put them in \`additionalContext\`.

### Response format

Respond **only** as structured output matching that JSON object — **no** markdown fences, **no** preamble, **no** commentary outside the schema.`;

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

/**
 * Extracts a full user profile from 3 onboarding drill transcripts.
 * This replaces explicit onboarding questions with inference from natural speech.
 */
export async function buildUserProfileFieldsFromDrills(
    input: DrillBasedProfileInput,
): Promise<UserProfileFieldsFromAI> {
    const hasTranscript = input.drills.some((d) => d.transcript.trim().length > 0);
    if (!hasTranscript) {
        throw new Error(
            "ProfileContextBuilder requires at least one non-empty drill transcript.",
        );
    }

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(userProfileFieldsSchema),
            name: "UserProfileFields",
            description:
                "JSON object with user profile fields extracted from onboarding drill transcripts.",
        }),
        system: DRILL_BASED_SYSTEM_PROMPT,
        prompt: buildDrillBasedUserMessage(input),
        temperature: 0.2,
    });

    return result.output;
}
