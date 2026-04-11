import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { FirestoreCollections } from "@/constants/firebase/firestore-collections";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type {
    CaptureAnalysis,
    CaptureTranscriptLine,
} from "@/types/captures";
import type { SkillMemoryType } from "@/types/skill-memory";
import type { UserProfileType } from "@/types/user";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");
const MAX_LEARNER_CONTEXT_CHARS = 5_500;

const profileUpdateSchema = z.object({
    learnerContextAdditions: z.string(),
    newStrengths: z.array(z.string()),
    newWeaknesses: z.array(z.string()),
    reinforcementItems: z.array(z.string()),
});

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "user-profiling.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.CAPTURE_ANALYZER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function formatTranscript(transcript: CaptureTranscriptLine[]): string {
    return transcript
        .map(
            (line) =>
                `[${line.start.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");
}

function deduplicateAndCap(items: string[], limit: number): string[] {
    const normalized = items
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return Array.from(new Set(normalized)).slice(0, limit);
}

export async function updateUserProfileFromCapture(
    uid: string,
    captureId: string,
    transcript: CaptureTranscriptLine[],
    analysis: CaptureAnalysis,
    title: string,
    summary: string,
): Promise<void> {
    const db = getAdminFirestore();

    const [userSnap, skillSnap] = await Promise.all([
        db.collection(FirestoreCollections.users.path).doc(uid).get(),
        db.collection(FirestoreCollections.skillMemories.path).doc(uid).get(),
    ]);

    const userProfile = userSnap.data() as UserProfileType | undefined;
    if (!userProfile) return;

    const skillData = skillSnap.data() as Partial<SkillMemoryType> | undefined;
    const currentStrengths = Array.isArray(skillData?.strengths)
        ? (skillData.strengths as string[])
        : [];
    const currentWeaknesses = Array.isArray(skillData?.weaknesses)
        ? (skillData.weaknesses as string[])
        : [];
    const currentReinforcement = Array.isArray(skillData?.reinforcementFocus)
        ? (skillData.reinforcementFocus as string[])
        : [];
    const currentMastered = Array.isArray(skillData?.masteredFocus)
        ? (skillData.masteredFocus as string[])
        : [];

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(profileUpdateSchema),
            name: "CaptureProfileUpdate",
            description:
                "Profile updates derived from a real conversation capture.",
        }),
        system: readPrompt(),
        prompt: `## Current user profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}
- Existing learner context: ${userProfile.internalLearnerContext?.trim() || "(empty)"}

## Current skill memory
- Strengths: ${currentStrengths.join("; ") || "(none)"}
- Weaknesses: ${currentWeaknesses.join("; ") || "(none)"}
- Mastered focus: ${currentMastered.join("; ") || "(none)"}
- Reinforcement focus: ${currentReinforcement.join("; ") || "(none)"}

## Capture context
Title: ${title}
Summary: ${summary}

## Analysis summary
Teachable moments: ${analysis.teachableMoments.length} (${analysis.teachableMoments.filter((m) => m.severity === "major").length} major)
Grammar patterns: ${analysis.grammarPatterns.map((p) => p.pattern).join("; ") || "(none)"}
Filler words: ${analysis.fillerWords.perMinute.toFixed(1)}/min
Fluency: ${analysis.fluency.wordsPerMinute} WPM
Communication style: directness=${analysis.communicationStyle.directness.toFixed(2)}, confidence=${analysis.communicationStyle.confidence.toFixed(2)}

## Transcript
${formatTranscript(transcript)}`,
        temperature: 0.15,
    });

    const {
        learnerContextAdditions,
        newStrengths,
        newWeaknesses,
        reinforcementItems,
    } = result.output;

    // Merge learner context additions into the user profile
    if (learnerContextAdditions.trim()) {
        const existing = userProfile.internalLearnerContext?.trim() || "";
        const merged = existing
            ? `${existing}\n\n--- From capture ${captureId} ---\n${learnerContextAdditions.trim()}`
            : learnerContextAdditions.trim();

        const capped =
            merged.length > MAX_LEARNER_CONTEXT_CHARS
                ? merged.slice(-MAX_LEARNER_CONTEXT_CHARS)
                : merged;

        await db
            .collection(FirestoreCollections.users.path)
            .doc(uid)
            .set(
                {
                    internalLearnerContext: capped,
                    updatedAt: new Date().toISOString(),
                },
                { merge: true },
            );
    }

    // Merge skill memory updates
    const mergedStrengths = deduplicateAndCap(
        [...currentStrengths, ...newStrengths],
        8,
    );
    const mergedWeaknesses = deduplicateAndCap(
        [...currentWeaknesses, ...newWeaknesses],
        8,
    );
    const mergedReinforcement = deduplicateAndCap(
        [...currentReinforcement, ...reinforcementItems],
        5,
    );

    const skillUpdate: Record<string, unknown> = {
        strengths: mergedStrengths,
        weaknesses: mergedWeaknesses,
        reinforcementFocus: mergedReinforcement,
        updatedAt: new Date().toISOString(),
    };

    if (skillSnap.exists) {
        await db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid)
            .set(skillUpdate, { merge: true });
    } else {
        await db
            .collection(FirestoreCollections.skillMemories.path)
            .doc(uid)
            .set({
                uid,
                ...skillUpdate,
                masteredFocus: [],
                lastProcessedSessionId: null,
                createdAt: new Date().toISOString(),
            });
    }
}
