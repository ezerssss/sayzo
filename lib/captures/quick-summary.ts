import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type {
    CaptureCloseReason,
    CaptureTranscriptLine,
} from "@/types/captures";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

// Cap on transcript characters sent to the LLM. The full deep analysis runs
// later with the entire transcript; this pass just needs enough context to
// name the conversation. ~8 KB ≈ 10-15 minutes of dialogue, which covers
// most captures completely and the topic of any longer one.
const TRANSCRIPT_CHAR_BUDGET = 8000;

// 5s ceiling so a slow LLM call never blocks the upload response. The agent
// already has a placeholder title to fall back on, and the deep analysis
// stage will produce a better title later either way.
const QUICK_SUMMARY_TIMEOUT_MS = 5000;

const quickSummarySchema = z.object({
    title: z.string(),
    summary: z.string(),
});

export type QuickSummaryInput = {
    transcript: CaptureTranscriptLine[];
    closeReason: CaptureCloseReason;
    durationSecs: number;
};

export type QuickSummaryResult = {
    title: string;
    summary: string;
};

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "quick-summary.md"), "utf-8");
}

function defaultModel(): string {
    return (
        process.env.QUICK_SUMMARY_MODEL?.trim() ||
        process.env.CAPTURE_ANALYZER_MODEL?.trim() ||
        process.env.ANALYZER_MODEL?.trim() ||
        "gpt-4o-mini"
    );
}

function formatTranscript(transcript: CaptureTranscriptLine[]): string {
    const full = transcript
        .map(
            (line) =>
                `[${line.start.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");

    if (full.length <= TRANSCRIPT_CHAR_BUDGET) return full;
    return (
        full.slice(0, TRANSCRIPT_CHAR_BUDGET) +
        "\n... (transcript truncated for the quick pass — deep analysis sees the full thing)"
    );
}

export async function generateQuickSummary(
    input: QuickSummaryInput,
): Promise<QuickSummaryResult> {
    const { transcript, closeReason, durationSecs } = input;

    const prompt = `## Capture context
Duration: ${Math.round(durationSecs)} seconds
Close reason: ${closeReason}

## Transcript (speaker-tagged)
${formatTranscript(transcript)}`;

    const result = await generateText({
        model: openai(defaultModel()),
        output: Output.object({
            schema: zodSchema(quickSummarySchema),
            name: "CaptureQuickSummary",
            description:
                "Short neutral title (3-7 words) and 1-2 sentence summary for a freshly captured conversation.",
        }),
        system: readPrompt(),
        prompt,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(QUICK_SUMMARY_TIMEOUT_MS),
    });

    return {
        title: result.output.title.trim(),
        summary: result.output.summary.trim(),
    };
}

/**
 * Computed conversation duration from the last transcript line. Falls back to
 * 0 when the transcript is empty (which `parseAndValidateRecord` already
 * rejects, so this is defense-in-depth only).
 */
export function inferDurationSecs(
    transcript: CaptureTranscriptLine[],
    startedAt: string,
    endedAt: string,
): number {
    const lastLineEnd = transcript.length
        ? transcript[transcript.length - 1].end
        : 0;
    if (lastLineEnd > 0) return lastLineEnd;

    const start = Date.parse(startedAt);
    const end = Date.parse(endedAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return (end - start) / 1000;
    }
    return 0;
}
