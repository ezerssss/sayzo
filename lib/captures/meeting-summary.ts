import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { runInstrumentedLLM } from "@/lib/llm/instrument";
import { loadModelPromptParts } from "@/lib/openai/prompt";
import { modelTuningOptions } from "@/lib/openai/reasoning";
import type {
    CaptureTranscriptLine,
    MeetingSummary,
    MeetingSummaryActionItem,
    MeetingSummaryBullet,
} from "@/schemas";
import { findFabricatedToken, SPELLED_INTEGERS } from "./fabrication-floor";

const PROMPTS_DIR = join(process.cwd(), "prompts", "captures");

// The pass runs concurrently with deep analysis (the long pole of the analyze
// stage), so a generous ceiling adds no wall-clock time — it only stops a hung
// call from holding the stage open.
const MEETING_SUMMARY_TIMEOUT_MS = 30_000;

// LLM output shape: the stored schema minus the server-stamped `generatedAt`.
// Kept lenient on purpose — verification happens in buildMeetingSummary, and
// a malformed section should degrade to an empty one, not fail the parse.
const llmMeetingSummarySchema = z.object({
    tldr: z.string(),
    whatHappened: z.array(
        z.object({ text: z.string(), isDecision: z.boolean() }),
    ),
    yourActionItems: z.array(
        z.object({ text: z.string(), deadline: z.string().nullable() }),
    ),
    othersActionItems: z.array(
        z.object({ text: z.string(), deadline: z.string().nullable() }),
    ),
    comingUp: z.string().nullable(),
});
type LlmMeetingSummary = z.infer<typeof llmMeetingSummarySchema>;

export type MeetingSummaryInput = {
    transcript: CaptureTranscriptLine[];
    durationSecs: number;
    /** True when only the user's side was captured — no other participants, so
     *  `othersActionItems` is forced empty and the prompt is reframed user-only. */
    isOneSided: boolean;
    refs?: { uid?: string | null; captureId?: string | null };
};

// Appended to the prompt for one-sided captures. buildMeetingSummary also
// hard-empties othersActionItems as a belt-and-braces guarantee.
const ONE_SIDED_SUMMARY_NOTE = `\n\n## One-sided capture\nOnly the user's side was captured — there are no other participants in this transcript. \`othersActionItems\` MUST be empty. Build \`tldr\`, \`whatHappened\`, and \`yourActionItems\` from the user's own speech only — never invent another party or what they said or committed to. For solo practice or a one-way recording, a short summary (or mostly-empty sections) is the correct, complete answer.`;

function readPrompt(): string {
    return readFileSync(join(PROMPTS_DIR, "meeting-summary.md"), "utf-8");
}

/**
 * Defaults to `gpt-4o-mini` directly (like the quick-summary pass) so bumping
 * `CAPTURE_ANALYZER_MODEL` for deep analysis never drags this pass along.
 * Override via the dedicated `MEETING_SUMMARY_MODEL` env — reasoning models
 * work here (the 30s ceiling is wide enough at low effort).
 */
function defaultModel(): string {
    return process.env.MEETING_SUMMARY_MODEL?.trim() || "gpt-4o-mini";
}

// No transcript index/truncation: nothing in the notes anchors back to a line,
// and a long meeting is exactly the capture whose tail (wrap-up, action items,
// "let's sync Thursday") matters most.
function formatTranscript(transcript: CaptureTranscriptLine[]): string {
    return transcript
        .map(
            (line) =>
                `[${line.start.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");
}

const WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];
const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];
const RELATIVE_DAY_WORDS = ["today", "tonight", "tomorrow", "eod", "eow"];
const SPECIFIC_WORDS = new Set([...WEEKDAYS, ...MONTHS, ...RELATIVE_DAY_WORDS]);

/**
 * Grounding check for deadline strings, stricter than `findFabricatedToken`:
 * deadlines are short and often START with the specific token ("Friday at 3"),
 * where the floor's sentence-initial proper-noun skip would wave an invented
 * weekday through. Here every date/number-shaped token — digits, weekday and
 * month names, today/tonight/tomorrow/eod/eow — must appear in the transcript
 * regardless of position. Any miss nulls the deadline (the item survives):
 * an action item with no deadline beats one with an invented deadline.
 */
function verifyDeadline(
    deadline: string | null,
    transcript: CaptureTranscriptLine[],
): string | null {
    const trimmed = deadline?.trim();
    if (!trimmed) return null;

    const haystack = transcript
        .map((l) => l.text)
        .join("\n")
        .toLowerCase();
    const digitHaystack = haystack.replace(/[^a-z0-9]/g, "");

    for (const rawToken of trimmed.split(/\s+/)) {
        const token = rawToken
            .replace(/^[^\p{L}\p{N}'’$]+|[^\p{L}\p{N}'’%]+$/gu, "")
            .toLowerCase();
        if (!token) continue;

        if (/\d/.test(token)) {
            const normalized = token.replace(/[^a-z0-9]/g, "");
            if (digitHaystack.includes(normalized)) continue;
            const asInt = Number.parseInt(normalized, 10);
            if (
                String(asInt) === normalized &&
                asInt >= 0 &&
                asInt <= 12 &&
                haystack.includes(SPELLED_INTEGERS[asInt])
            ) {
                continue;
            }
            return null;
        }

        if (SPECIFIC_WORDS.has(token) && !haystack.includes(token)) {
            return null;
        }
    }
    return trimmed;
}

function buildActionItems(
    raw: { text: string; deadline: string | null }[],
    transcript: CaptureTranscriptLine[],
    label: string,
): MeetingSummaryActionItem[] {
    const items: MeetingSummaryActionItem[] = [];
    for (const item of raw) {
        const text = item.text.trim();
        if (!text) continue;
        const fabricated = findFabricatedToken([text], transcript);
        if (fabricated) {
            console.warn(
                `[meeting-summary] dropped ${label} item: invents "${fabricated}" not in the transcript`,
            );
            continue;
        }
        items.push({
            text,
            deadline: verifyDeadline(item.deadline, transcript),
        });
    }
    return items;
}

/**
 * Build the stored `MeetingSummary` from the lenient LLM output. NEVER throws
 * — on any problem it returns null and the capture still reaches `analyzed`
 * without the field (failure isolation, same stance as buildCoachingInsight).
 *
 * Grounding floor: a fabricated specific in the `tldr` rejects the whole
 * summary (the lead sentence is the one part every reader sees); in a bullet
 * or action item it drops just that item; in `comingUp` it nulls the field;
 * in a deadline it nulls the deadline and keeps the item. Always omit, never
 * rewrite.
 */
function buildMeetingSummary(
    raw: LlmMeetingSummary | null,
    transcript: CaptureTranscriptLine[],
    isOneSided = false,
): MeetingSummary | null {
    try {
        if (!raw) return null;

        const tldr = raw.tldr.trim();
        if (!tldr) return null;
        const tldrFabricated = findFabricatedToken([tldr], transcript);
        if (tldrFabricated) {
            console.warn(
                `[meeting-summary] rejected: tldr invents "${tldrFabricated}" not in the transcript`,
            );
            return null;
        }

        const whatHappened: MeetingSummaryBullet[] = [];
        for (const bullet of raw.whatHappened) {
            const text = bullet.text.trim();
            if (!text) continue;
            const fabricated = findFabricatedToken([text], transcript);
            if (fabricated) {
                console.warn(
                    `[meeting-summary] dropped bullet: invents "${fabricated}" not in the transcript`,
                );
                continue;
            }
            whatHappened.push({ text, isDecision: bullet.isDecision });
        }

        let comingUp = raw.comingUp?.trim() || null;
        if (comingUp) {
            const fabricated = findFabricatedToken([comingUp], transcript);
            if (fabricated) {
                console.warn(
                    `[meeting-summary] dropped comingUp: invents "${fabricated}" not in the transcript`,
                );
                comingUp = null;
            }
        }

        return {
            tldr,
            whatHappened,
            yourActionItems: buildActionItems(
                raw.yourActionItems,
                transcript,
                "yourActionItems",
            ),
            // One-sided captures have no other participants — never surface
            // others' commitments even if the model imagined some.
            othersActionItems: isOneSided
                ? []
                : buildActionItems(
                      raw.othersActionItems,
                      transcript,
                      "othersActionItems",
                  ),
            comingUp,
            generatedAt: new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

/**
 * Generate the structured meeting summary for a validated capture. Returns
 * null when verification rejects the output wholesale; throws only on
 * transport/parse errors (the pipeline caller catches and continues — summary
 * failure must never block coaching).
 */
export async function generateMeetingSummary(
    input: MeetingSummaryInput,
): Promise<MeetingSummary | null> {
    const { transcript, durationSecs, isOneSided, refs } = input;
    if (transcript.length === 0) return null;

    // Deliberately no calendar date in the context: giving the model today's
    // date invites resolving "by Friday" into an invented absolute date.
    const prompt = `## Conversation context
Duration: ${Math.round(durationSecs)} seconds

## Transcript (speaker-tagged — the single source of truth)
The "user" speaker is the person these notes are for. All other speakers (other_1, other_2, ...) are other participants.
${formatTranscript(transcript)}`;

    const modelName = defaultModel();
    const promptParts = loadModelPromptParts(readPrompt(), modelName);
    const { result } = await runInstrumentedLLM({
        promptKey: "capture.meeting_summary",
        model: modelName,
        promptParts,
        refs: { uid: refs?.uid ?? null, captureId: refs?.captureId ?? null },
        call: () =>
            generateText({
                model: openai(modelName),
                output: Output.object({
                    schema: zodSchema(llmMeetingSummarySchema),
                    name: "MeetingSummary",
                    description:
                        "Short actionable written notes for a captured conversation: TL;DR, what happened, action items with grounded deadlines, what's coming up.",
                }),
                system: promptParts.system,
                // One-sided note goes LAST — after the chat-model recap — so it
                // isn't re-buried by the recap's two-sided participant framing.
                prompt: `${
                    promptParts.postTranscriptRecap
                        ? `${prompt}\n\n${promptParts.postTranscriptRecap}`
                        : prompt
                }${isOneSided ? ONE_SIDED_SUMMARY_NOTE : ""}`,
                ...modelTuningOptions(modelName, {
                    temperature: 0.2,
                    reasoningEffort: "low",
                    textVerbosity: "low",
                }),
                abortSignal: AbortSignal.timeout(MEETING_SUMMARY_TIMEOUT_MS),
            }),
    });

    return buildMeetingSummary(result.output, transcript, isOneSided);
}

// Exposed for unit tests only (mirrors lib/captures/analyze.ts).
export const __test = {
    buildMeetingSummary,
    verifyDeadline,
};
