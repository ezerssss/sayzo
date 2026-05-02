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
const MAX_CAPTURE_CONTEXT_CHARS = 5_500;
const MAX_CAPTURE_DELIVERY_CHARS = 3_500;

const profileUpdateSchema = z.object({
    /** New bullet notes about who/what/how the user converses (context, not delivery). */
    contextAdditions: z.string(),
    /** New bullet notes about HOW the user speaks: prosody, pace, tone, vocal patterns. */
    deliveryAdditions: z.string(),
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

function formatDimension(dim: {
    assessment: string;
    findings: {
        anchor: string;
        betterOption: string;
        whyThisMatters?: string;
        whyIssue?: string;
    }[];
}): string {
    const assessment = dim.assessment.trim();
    // Compact each finding into "anchor — why (Better: betterOption)" so the
    // profiler model has the gist without the full narrative.
    const findingsText = dim.findings
        .map((f) => {
            const why = (f.whyThisMatters ?? f.whyIssue ?? "").trim();
            return `${f.anchor.trim()} — ${why} (Better: ${f.betterOption.trim()})`;
        })
        .join("; ");
    if (!assessment && !findingsText) return "(none)";
    if (assessment && findingsText)
        return `${assessment} | findings: ${findingsText}`;
    return assessment || findingsText;
}

function deduplicateAndCap(items: string[], limit: number): string[] {
    const normalized = items
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    return Array.from(new Set(normalized)).slice(0, limit);
}

function appendBullets(
    existing: string,
    additions: string,
    captureId: string,
    maxChars: number,
): string {
    const trimmed = additions.trim();
    if (!trimmed) return existing;

    const existingTrimmed = existing.trim();
    const merged = existingTrimmed
        ? `${existingTrimmed}\n\n--- From capture ${captureId} ---\n${trimmed}`
        : trimmed;

    return merged.length > maxChars ? merged.slice(-maxChars) : merged;
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

    // Idempotency: skip if this capture has already been merged into the
    // user's capture context fields.
    if (userProfile.lastInternalCaptureContextCaptureId === captureId) {
        return;
    }

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
                "Profile updates derived from a real conversation capture (context + delivery, separately).",
        }),
        system: readPrompt(),
        prompt: `## Current user profile
- Role: ${userProfile.role || "(not set)"}
- Industry: ${userProfile.industry || "(not set)"}
- Company: ${userProfile.companyName || "(not set)"}

## Existing internal capture context (what/who/how the user converses)
${userProfile.internalCaptureContext?.trim() || "(empty — no captures merged yet)"}

## Existing internal capture delivery notes (HOW the user speaks)
${userProfile.internalCaptureDeliveryNotes?.trim() || "(empty — no captures merged yet)"}

## Current skill memory
- Strengths: ${currentStrengths.join("; ") || "(none)"}
- Weaknesses: ${currentWeaknesses.join("; ") || "(none)"}
- Mastered focus: ${currentMastered.join("; ") || "(none)"}
- Reinforcement focus: ${currentReinforcement.join("; ") || "(none)"}

## Capture context
Title: ${title}
Summary: ${summary}

## Analysis high-level
- Overview: ${analysis.overview}
- Main issue: ${analysis.mainIssue}
- Secondary issues: ${analysis.secondaryIssues.join("; ") || "(none)"}
- Notes: ${analysis.notes || "(none)"}

## Dimensional findings
- Structure & flow: ${formatDimension(analysis.structureAndFlow)}
- Clarity & conciseness: ${formatDimension(analysis.clarityAndConciseness)}
- Relevance & focus: ${formatDimension(analysis.relevanceAndFocus)}
- Engagement: ${formatDimension(analysis.engagement)}
- Professionalism: ${formatDimension(analysis.professionalism)}
- Voice/tone/expression: ${formatDimension(analysis.voiceToneExpression)}

## Quantitative summary
- Teachable moments: ${(() => {
    const all = [
        ...(analysis.fixTheseFirst ?? []),
        ...(analysis.moreMoments ?? []),
    ];
    return `${all.length} (${all.filter((m) => m.severity === "major").length} major)`;
})()}
- Grammar patterns: ${analysis.grammarPatterns.map((p) => `${p.pattern} (${p.frequency}x)`).join("; ") || "(none)"}
- Filler words: ${analysis.fillerWords.perMinute.toFixed(1)}/min
- Fluency: ${analysis.fluency.wordsPerMinute} WPM, ${analysis.fluency.selfCorrections} self-corrections, ${analysis.fluency.avgResponseLatencyMs}ms avg response latency
- Communication style: directness=${analysis.communicationStyle.directness.toFixed(2)}, formality=${analysis.communicationStyle.formality.toFixed(2)}, confidence=${analysis.communicationStyle.confidence.toFixed(2)}, turnTaking=${analysis.communicationStyle.turnTaking}

## Transcript
${formatTranscript(transcript)}`,
        temperature: 0.15,
    });

    const {
        contextAdditions,
        deliveryAdditions,
        newStrengths,
        newWeaknesses,
        reinforcementItems,
    } = result.output;

    // Merge into user profile capture context fields
    const userUpdate: Record<string, unknown> = {
        lastInternalCaptureContextCaptureId: captureId,
        updatedAt: new Date().toISOString(),
    };

    if (contextAdditions.trim()) {
        userUpdate.internalCaptureContext = appendBullets(
            userProfile.internalCaptureContext ?? "",
            contextAdditions,
            captureId,
            MAX_CAPTURE_CONTEXT_CHARS,
        );
    }
    if (deliveryAdditions.trim()) {
        userUpdate.internalCaptureDeliveryNotes = appendBullets(
            userProfile.internalCaptureDeliveryNotes ?? "",
            deliveryAdditions,
            captureId,
            MAX_CAPTURE_DELIVERY_CHARS,
        );
    }

    await db
        .collection(FirestoreCollections.users.path)
        .doc(uid)
        .set(userUpdate, { merge: true });

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
