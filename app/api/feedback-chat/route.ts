import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import { FirestoreCollections } from "@/schemas";
import { requireAuth } from "@/lib/auth/require-auth";
import { applyTranscriptCorrections } from "@/lib/captures/corrections";
import {
    assertHasCredit,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { CaptureTranscriptLine, CaptureType } from "@/schemas";
import type { SessionType } from "@/schemas";

type FeedbackChatSource = "session" | "capture";

function buildSystemPrompt(source: FeedbackChatSource): string {
    const sourceLabel =
        source === "capture"
            ? "real-life conversation we captured for analysis"
            : "spoken practice drill";
    return `You are Sayzo's feedback coach. The user just completed a ${sourceLabel} and received AI-generated coaching feedback. They now want to discuss that feedback with you — ask follow-up questions, challenge points, get clarification, or dig deeper.

You have access to:
1. The original transcript (what the user actually said)
2. The specific feedback section they're looking at
3. The feedback section title (e.g. "Structure & flow", "Clarity & conciseness")

Guidelines:
- Be conversational, direct, and concise. This is a dialogue, not a lecture.
- If the user pushes back on a feedback point (e.g. "is that really a problem?"), engage honestly. Sometimes their approach is fine and the feedback was too aggressive — acknowledge that. Other times, explain why the issue matters with specific reasoning.
- Ground your responses in what they actually said (reference the transcript). Don't be generic.
- If they ask for alternative phrasings or examples, give concrete ones tailored to their scenario. These are lines they'd say out loud, so write them the way they'd actually be spoken — never put an em dash or en dash in a suggested phrasing (there's no audible dash); use the comma or period the speech actually has.
- Keep responses focused — typically 2-4 sentences unless they ask for more detail.
- Don't repeat the original feedback verbatim. They can already see it. Build on it.
- Match their energy — if they're casual, be casual. If they want depth, go deep.
- When referencing specific moments, always include the timestamp in mm:ss format (e.g. "At 2:36" or "at 0:45"). The user can click these to jump to that point in their recording.`;
}

function buildContextMessage(
    transcript: string,
    feedbackContent: string,
    sectionTitle: string,
): string {
    return `## Feedback section: ${sectionTitle}

${feedbackContent}

## Transcript
${transcript}`;
}

function formatCaptureTranscript(lines: CaptureTranscriptLine[]): string {
    if (!lines.length) return "(no transcript available)";
    return lines
        .map(
            (line, idx) =>
                `[${idx}] [${line.start.toFixed(1)}s - ${line.end.toFixed(1)}s] ${line.speaker}: ${line.text}`,
        )
        .join("\n");
}

async function loadSourceContext(
    source: FeedbackChatSource,
    sourceId: string,
    uid: string,
): Promise<
    | { ok: true; transcript: string }
    | { ok: false; status: number; error: string }
> {
    const db = getAdminFirestore();

    if (source === "session") {
        const snap = await db
            .collection(FirestoreCollections.sessions.path)
            .doc(sourceId)
            .get();
        if (!snap.exists) {
            return { ok: false, status: 404, error: "Session not found" };
        }
        const session = snap.data() as SessionType;
        if (session.uid !== uid) {
            return { ok: false, status: 403, error: "Unauthorized" };
        }
        return {
            ok: true,
            transcript:
                session.transcript?.trim() ?? "(no transcript available)",
        };
    }

    const snap = await db
        .collection(FirestoreCollections.captures.path)
        .doc(sourceId)
        .get();
    if (!snap.exists) {
        return { ok: false, status: 404, error: "Conversation not found" };
    }
    const capture = snap.data() as CaptureType;
    if (capture.uid !== uid) {
        return { ok: false, status: 403, error: "Unauthorized" };
    }
    // Mishearing fixes overlay — the chat should reference the corrected
    // names/terms, not what the transcription originally heard.
    const lines = applyTranscriptCorrections(
        capture.serverTranscript ?? [],
        capture.transcriptCorrections ?? [],
    );
    return { ok: true, transcript: formatCaptureTranscript(lines) };
}

export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    const body = await request.json();
    const {
        messages,
        source,
        sourceId,
        sectionTitle,
        feedbackContent,
    } = body as {
        messages: UIMessage[];
        source: FeedbackChatSource;
        sourceId: string;
        sectionTitle: string;
        feedbackContent: string;
    };

    if (source !== "session" && source !== "capture") {
        return Response.json(
            { error: "Invalid or missing source (expected 'session' or 'capture')" },
            { status: 400 },
        );
    }

    if (!sourceId) {
        return Response.json(
            { error: "Missing sourceId" },
            { status: 400 },
        );
    }

    const loaded = await loadSourceContext(source, sourceId, uid);
    if (!loaded.ok) {
        return Response.json({ error: loaded.error }, { status: loaded.status });
    }

    try {
        await assertHasCredit(uid);
    } catch (err) {
        if (err instanceof CreditLimitReachedError) {
            return creditLimitResponse();
        }
        throw err;
    }

    const contextMessage = buildContextMessage(
        loaded.transcript,
        feedbackContent,
        sectionTitle,
    );

    // Feedback chat is interactive Q&A about the learner's existing feedback —
    // no synthesis is required (the feedback is already produced). Defaults to
    // `gpt-4o-mini` directly so bumping `ANALYZER_MODEL` for drill/focus
    // synthesis doesn't drag this chat along with it. Override only via the
    // dedicated `FEEDBACK_CHAT_MODEL` env (must be a non-reasoning model —
    // streaming + reasoning models don't pair well for an interactive chat).
    const model =
        process.env.FEEDBACK_CHAT_MODEL?.trim() || "gpt-4o-mini";

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
        model: openai(model),
        system: buildSystemPrompt(source),
        messages: [
            { role: "user", content: contextMessage },
            {
                role: "assistant",
                content: [
                    {
                        type: "text",
                        text: "I've reviewed the feedback and your transcript. What would you like to discuss?",
                    },
                ],
            },
            ...modelMessages,
        ],
        temperature: 0.4,
    });

    return result.toUIMessageStreamResponse();
}
