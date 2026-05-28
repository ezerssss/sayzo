import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { FirestoreCollections } from "@/schemas";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
    getOrHydrateLearnerModel,
    learnerModelDoc,
} from "@/lib/learner-model/store";
import { mergeTrackedPatterns } from "@/lib/learner-model/tracked-patterns";
import { temperatureOptions } from "@/lib/openai/reasoning";
import { llmTrackedPatternSchema } from "@/schemas";
import type {
    ItemAnalysis,
    CaptureTranscriptLine,
} from "@/schemas";
import type { UserProfileType } from "@/schemas";

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
    /**
     * Durable habits this capture evidences. Propose `{id,label,category,kind}`;
     * reuse an existing id from "Current tracked patterns" for the same habit.
     * The server owns trend/recency/occurrences.
     */
    trackedPatterns: z.array(llmTrackedPatternSchema).max(15),
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
        whyThisMatters: string;
    }[];
}): string {
    const assessment = dim.assessment.trim();
    // Compact each finding into "anchor — why (Better: betterOption)" so the
    // profiler model has the gist without the full narrative.
    const findingsText = dim.findings
        .map((f) => {
            const why = f.whyThisMatters.trim();
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
    analysis: ItemAnalysis,
    title: string,
    summary: string,
): Promise<void> {
    const db = getAdminFirestore();

    const [userSnap, model] = await Promise.all([
        db.collection(FirestoreCollections.users.path).doc(uid).get(),
        getOrHydrateLearnerModel(db, uid),
    ]);

    const userProfile = userSnap.data() as UserProfileType | undefined;
    if (!userProfile) return;

    // Idempotency: skip if this capture has already been merged into the
    // learner model's capture context.
    if (model.lastCaptureContextCaptureId === captureId) {
        return;
    }

    const currentStrengths = model.strengths;
    const currentWeaknesses = model.weaknesses;
    const currentReinforcement = model.reinforcementFocus;
    const currentMastered = model.masteredFocus;

    const trackedPatternsBlock = model.trackedPatterns.length
        ? model.trackedPatterns
              .map(
                  (p) =>
                      `- [id: ${p.id}] (${p.kind}, ${p.trend}, seen ${p.occurrences}×) ${p.label}`,
              )
              .join("\n")
        : "(none yet)";

    const modelName = defaultModel();
    const result = await generateText({
        model: openai(modelName),
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
${model.context.realWorldNotes.trim() || "(empty — no captures merged yet)"}

## Existing internal capture delivery notes (HOW the user speaks)
${model.context.deliveryNotes.trim() || "(empty — no captures merged yet)"}

## Current skill memory
- Strengths: ${currentStrengths.join("; ") || "(none)"}
- Weaknesses: ${currentWeaknesses.join("; ") || "(none)"}
- Mastered focus: ${currentMastered.join("; ") || "(none)"}
- Reinforcement focus: ${currentReinforcement.join("; ") || "(none)"}

## Current tracked patterns (reuse the id when this capture shows the same habit)
${trackedPatternsBlock}

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

## Quantitative summary
- Teachable moments: ${(() => {
    const all = [
        ...(analysis.fixTheseFirst ?? []),
        ...(analysis.moreMoments ?? []),
    ];
    return `${all.length} (${all.filter((m) => m.severity === "major").length} major)`;
})()}
- Grammar patterns: ${(analysis.grammarPatterns ?? []).map((p) => `${p.pattern} (${p.frequency}x)`).join("; ") || "(none)"}
- Filler words: ${(analysis.fillerWords?.perMinute ?? 0).toFixed(1)}/min
- Fluency: ${analysis.fluency?.wordsPerMinute ?? 0} WPM, ${analysis.fluency?.selfCorrections ?? 0} self-corrections, ${analysis.fluency?.avgResponseLatencyMs ?? 0}ms avg response latency
- Communication style: directness=${(analysis.communicationStyle?.directness ?? 0).toFixed(2)}, formality=${(analysis.communicationStyle?.formality ?? 0).toFixed(2)}, confidence=${(analysis.communicationStyle?.confidence ?? 0).toFixed(2)}, turnTaking=${analysis.communicationStyle?.turnTaking ?? "n/a"}

## Transcript
${formatTranscript(transcript)}`,
        ...temperatureOptions(modelName, 0.15),
    });

    const {
        contextAdditions,
        deliveryAdditions,
        newStrengths,
        newWeaknesses,
        reinforcementItems,
        trackedPatterns,
    } = result.output;

    // Write ONLY the fields this capture-side writer owns. We must not spread
    // the whole `...model` snapshot back: it was read before the (slow) LLM
    // call, so re-committing it would clobber fields a concurrent drill writer
    // advanced in the meantime — `context.drillNotes`, `masteredFocus`, and the
    // `lastProcessedSessionId` / `lastLearnerContextSessionId` cursors (rewinding
    // a cursor would re-process an already-consumed session). Firestore
    // deep-merges nested maps, so writing only the changed `context` keys
    // preserves `drillNotes`. (`currentMastered` is read for the prompt only.)
    const now = new Date().toISOString();
    const contextPatch: Record<string, string> = {};
    if (contextAdditions.trim()) {
        contextPatch.realWorldNotes = appendBullets(
            model.context.realWorldNotes,
            contextAdditions,
            captureId,
            MAX_CAPTURE_CONTEXT_CHARS,
        );
    }
    if (deliveryAdditions.trim()) {
        contextPatch.deliveryNotes = appendBullets(
            model.context.deliveryNotes,
            deliveryAdditions,
            captureId,
            MAX_CAPTURE_DELIVERY_CHARS,
        );
    }

    const patch: Record<string, unknown> = {
        trackedPatterns: mergeTrackedPatterns(
            model.trackedPatterns,
            trackedPatterns,
            captureId,
            now,
        ),
        strengths: deduplicateAndCap([...currentStrengths, ...newStrengths], 8),
        weaknesses: deduplicateAndCap(
            [...currentWeaknesses, ...newWeaknesses],
            8,
        ),
        reinforcementFocus: deduplicateAndCap(
            [...currentReinforcement, ...reinforcementItems],
            5,
        ),
        lastCaptureContextCaptureId: captureId,
        updatedAt: now,
    };
    if (Object.keys(contextPatch).length > 0) {
        patch.context = contextPatch;
    }

    await learnerModelDoc(db, uid).set(patch, { merge: true });
}
