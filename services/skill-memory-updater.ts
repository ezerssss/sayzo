import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { SessionAnalysisType } from "@/types/sessions";
import type { SkillMemoryType } from "@/types/skill-memory";

const PROMPTS_DIR = join(process.cwd(), "prompts", "skill-memory-updater");

const skillMemoryPatchSchema = z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    recentFocus: z.array(z.string()),
});

export type SkillMemoryUpdaterInput = {
    skillMemory: Pick<SkillMemoryType, "strengths" | "weaknesses" | "recentFocus">;
    latestSession: {
        analysis: SessionAnalysisType;
        feedback: string;
    };
};

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "update-memory.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.SKILL_MEMORY_UPDATER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function buildUserMessage(input: SkillMemoryUpdaterInput): string {
    return `
## Current skill memory
- Strengths: ${input.skillMemory.strengths.length ? input.skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${input.skillMemory.weaknesses.length ? input.skillMemory.weaknesses.join("; ") : "(none)"}
- Recent focus: ${input.skillMemory.recentFocus.length ? input.skillMemory.recentFocus.join("; ") : "(none)"}

## Latest session analysis
\`\`\`json
${JSON.stringify(input.latestSession.analysis, null, 2)}
\`\`\`

## Latest session feedback
${input.latestSession.feedback.trim()}
`.trim();
}

function normalizeItems(values: string[], limit: number): string[] {
    return Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter((value) => value.length > 0),
        ),
    ).slice(0, limit);
}

export async function updateSkillMemoryFromLatestSession(
    input: SkillMemoryUpdaterInput,
): Promise<Pick<SkillMemoryType, "strengths" | "weaknesses" | "recentFocus">> {
    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(skillMemoryPatchSchema),
            name: "SkillMemoryPatch",
            description:
                "Updated strengths, weaknesses, and recentFocus after the latest completed session.",
        }),
        system: readPrompt(),
        prompt: buildUserMessage(input),
        temperature: 0.2,
    });

    return {
        strengths: normalizeItems(result.output.strengths, 8),
        weaknesses: normalizeItems(result.output.weaknesses, 8),
        recentFocus: normalizeItems(result.output.recentFocus, 3),
    };
}
