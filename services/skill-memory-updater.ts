import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { ItemAnalysis, SessionFeedbackType } from "@/schemas";
import {
    FirestoreCollections,
    hasSessionFeedbackContent,
    llmTrackedPatternSchema,
} from "@/schemas";
import type { LearnerModel, SessionType, TrackedPattern } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { learnerModelDoc } from "@/lib/learner-model/store";
import { mergeTrackedPatterns } from "@/lib/learner-model/tracked-patterns";
import { loadModelPrompt } from "@/lib/openai/prompt";
import { temperatureOptions } from "@/lib/openai/reasoning";

const PROMPTS_DIR = join(process.cwd(), "prompts", "skill-memory-updater");

const skillMemoryPatchSchema = z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    masteredFocus: z.array(z.string()),
    reinforcementFocus: z.array(z.string()),
    /**
     * Durable habits the learner shows. Reuse an existing `id` from "Current
     * tracked patterns" when it's the same habit (so the server keeps tracking
     * it over time); invent a new snake_case id for a genuinely new one. The
     * server owns trend / recency / occurrences — don't try to set them.
     */
    trackedPatterns: z.array(llmTrackedPatternSchema).max(15),
});

export type SkillMemoryUpdaterInput = {
    skillMemory: Pick<
        LearnerModel,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
    >;
    /** Current durable habits — the LLM reuses these ids to keep tracking them. */
    currentTrackedPatterns: TrackedPattern[];
    /** Source item id (session id) stamped onto patterns seen this round. */
    sourceId: string;
    latestSession: {
        completionStatus?: "pending" | "passed" | "needs_retry" | "skipped";
        completionReason?: string | null;
        analysis: ItemAnalysis;
        feedback: SessionFeedbackType;
        skillTarget?: string;
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
    const improvedVersion =
        input.latestSession.feedback.improvedVersion ?? "(none)";

    const trackedPatternsBlock = input.currentTrackedPatterns.length
        ? input.currentTrackedPatterns
              .map(
                  (p) =>
                      `- [id: ${p.id}] (${p.kind}, ${p.trend}, seen ${p.occurrences}×) ${p.label}`,
              )
              .join("\n")
        : "(none yet)";

    return `
## Current skill memory
- Strengths: ${input.skillMemory.strengths.length ? input.skillMemory.strengths.join("; ") : "(none)"}
- Weaknesses: ${input.skillMemory.weaknesses.length ? input.skillMemory.weaknesses.join("; ") : "(none)"}
- Mastered focus: ${input.skillMemory.masteredFocus.length ? input.skillMemory.masteredFocus.join("; ") : "(none)"}
- Reinforcement focus: ${input.skillMemory.reinforcementFocus.length ? input.skillMemory.reinforcementFocus.join("; ") : "(none)"}

## Current tracked patterns (reuse the id when this session shows the same habit)
${trackedPatternsBlock}

## Latest session context
- Completion status: ${input.latestSession.completionStatus?.trim() || "(unknown)"}
- Completion reason: ${input.latestSession.completionReason?.trim() || "(none)"}
- Skill target: ${input.latestSession.skillTarget?.trim() || "(none)"}

## Latest session analysis (rich dimensional findings)
\`\`\`json
${JSON.stringify(input.latestSession.analysis, null, 2)}
\`\`\`

## Improved-version rewrite (the polished native-speaker version of the user's response)
${improvedVersion}
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
): Promise<
    Pick<
        LearnerModel,
        | "strengths"
        | "weaknesses"
        | "masteredFocus"
        | "reinforcementFocus"
        | "trackedPatterns"
    >
> {
    const modelName = defaultModel();
    const result = await generateText({
        model: openai(modelName),
        output: Output.object({
            schema: zodSchema(skillMemoryPatchSchema),
            name: "SkillMemoryPatch",
            description:
                "Updated strengths, weaknesses, progression priorities, and tracked habits after the latest completed session.",
        }),
        system: loadModelPrompt(readPrompt(), modelName),
        prompt: buildUserMessage(input),
        ...temperatureOptions(modelName, 0.2),
    });

    return {
        strengths: normalizeItems(result.output.strengths, 8),
        weaknesses: normalizeItems(result.output.weaknesses, 8),
        masteredFocus: normalizeItems(result.output.masteredFocus, 8),
        reinforcementFocus: normalizeItems(result.output.reinforcementFocus, 5),
        // Server owns trend/recency/occurrences — merge the LLM's descriptive
        // patch into the stored set rather than trusting model-set state.
        trackedPatterns: mergeTrackedPatterns(
            input.currentTrackedPatterns,
            result.output.trackedPatterns,
            input.sourceId,
            new Date().toISOString(),
        ),
    };
}

/**
 * Refresh the learner model's skill fields + tracked habits from the latest
 * completed session, then merge-write only those fields back. Idempotent:
 * guards on the `lastProcessedSessionId` cursor and on the session having
 * usable feedback content, so re-running for the same session is a no-op.
 *
 * Re-homed from the deleted `services/drill-pre-generator.ts`. Standalone
 * drills are gone, so `/api/sessions/complete` calls this directly after a
 * replay's feedback persists — otherwise completed replays would stop updating
 * skill memory. Pass the just-completed session as `preloadedLatestSession` to
 * skip an extra Firestore read.
 */
export async function refreshSkillMemoryFromLatestSession(
    db: ReturnType<typeof getAdminFirestore>,
    uid: string,
    current: LearnerModel,
    preloadedLatestSession?: SessionType,
): Promise<LearnerModel> {
    let latestSession = preloadedLatestSession;
    if (latestSession == null) {
        const latestSessionSnap = await db
            .collection(FirestoreCollections.sessions.path)
            .where("uid", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
        if (latestSessionSnap.empty) return current;
        latestSession = latestSessionSnap.docs[0]?.data() as SessionType;
    }
    if (!latestSession?.id) return current;
    if (current.lastProcessedSessionId === latestSession.id) return current;
    const latestAnalysis = latestSession?.analysis;
    const latestFeedback = latestSession?.feedback;
    if (latestAnalysis == null || latestFeedback == null) return current;
    if (!hasSessionFeedbackContent(latestFeedback)) return current;

    const updatedFields = await updateSkillMemoryFromLatestSession({
        skillMemory: {
            strengths: current.strengths,
            weaknesses: current.weaknesses,
            masteredFocus: current.masteredFocus,
            reinforcementFocus: current.reinforcementFocus,
        },
        currentTrackedPatterns: current.trackedPatterns,
        sourceId: latestSession.id,
        latestSession: {
            completionStatus: latestSession?.completionStatus,
            completionReason: latestSession?.completionReason ?? null,
            analysis: latestAnalysis,
            feedback: latestFeedback,
            skillTarget: latestSession?.plan?.skillTarget ?? "",
        },
    });

    const now = new Date().toISOString();
    const updatedModel: LearnerModel = {
        ...current,
        ...updatedFields,
        lastProcessedSessionId: latestSession.id,
        updatedAt: now,
    };

    // Merge only the skill fields + tracked patterns back into the learner
    // model doc so we don't clobber context / cursors written by other steps.
    await learnerModelDoc(db, uid).set(
        {
            trackedPatterns: updatedModel.trackedPatterns,
            strengths: updatedModel.strengths,
            weaknesses: updatedModel.weaknesses,
            masteredFocus: updatedModel.masteredFocus,
            reinforcementFocus: updatedModel.reinforcementFocus,
            lastProcessedSessionId: updatedModel.lastProcessedSessionId,
            updatedAt: now,
        },
        { merge: true },
    );

    return updatedModel;
}
