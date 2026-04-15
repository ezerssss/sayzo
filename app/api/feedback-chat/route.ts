import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, type UIMessage } from "ai";

import {
    assertHasCredit,
    CreditLimitReachedError,
    creditLimitResponse,
} from "@/lib/credits/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { FirestoreCollectionName } from "@/enums/firebase";
import type { SessionType } from "@/types/sessions";

const SYSTEM_PROMPT = `You are Sayzo's feedback coach. The user just completed a spoken practice drill and received AI-generated coaching feedback. They now want to discuss that feedback with you — ask follow-up questions, challenge points, get clarification, or dig deeper.

You have access to:
1. The original session transcript (what the user actually said during their drill)
2. The specific feedback section they're looking at
3. The feedback section title (e.g. "Structure & flow", "Clarity & conciseness")

Guidelines:
- Be conversational, direct, and concise. This is a dialogue, not a lecture.
- If the user pushes back on a feedback point (e.g. "is that really a problem?"), engage honestly. Sometimes their approach is fine and the feedback was too aggressive — acknowledge that. Other times, explain why the issue matters with specific reasoning.
- Ground your responses in what they actually said (reference the transcript). Don't be generic.
- If they ask for alternative phrasings or examples, give concrete ones tailored to their scenario.
- Keep responses focused — typically 2-4 sentences unless they ask for more detail.
- Don't repeat the original feedback verbatim. They can already see it. Build on it.
- Match their energy — if they're casual, be casual. If they want depth, go deep.
- When referencing specific moments, always include the timestamp in mm:ss format (e.g. "At 2:36" or "at 0:45"). The user can click these to jump to that point in their recording.`;

function buildContextMessage(
    transcript: string,
    feedbackContent: string,
    sectionTitle: string,
): string {
    return `## Feedback section: ${sectionTitle}

${feedbackContent}

## Session transcript
${transcript}`;
}

export async function POST(request: Request) {
    const body = await request.json();
    const {
        messages,
        sessionId,
        uid,
        sectionTitle,
        feedbackContent,
    } = body as {
        messages: UIMessage[];
        sessionId: string;
        uid: string;
        sectionTitle: string;
        feedbackContent: string;
    };

    if (!sessionId || !uid) {
        return Response.json(
            { error: "Missing sessionId or uid" },
            { status: 400 },
        );
    }

    const db = getAdminFirestore();
    const sessionDoc = await db
        .collection(FirestoreCollectionName.SESSIONS)
        .doc(sessionId)
        .get();

    if (!sessionDoc.exists) {
        return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const session = sessionDoc.data() as SessionType;

    if (session.uid !== uid) {
        return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        await assertHasCredit(uid);
    } catch (err) {
        if (err instanceof CreditLimitReachedError) {
            return creditLimitResponse();
        }
        throw err;
    }

    const transcript = session.transcript?.trim() ?? "(no transcript available)";

    const contextMessage = buildContextMessage(
        transcript,
        feedbackContent,
        sectionTitle,
    );

    const model = process.env.ANALYZER_MODEL?.trim() || "gpt-4o-mini";

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
        model: openai(model),
        system: SYSTEM_PROMPT,
        messages: [
            { role: "user", content: contextMessage },
            { role: "assistant", content: [{ type: "text", text: "I've reviewed the feedback and your transcript. What would you like to discuss?" }] },
            ...modelMessages,
        ],
        temperature: 0.4,
    });

    return result.toUIMessageStreamResponse();
}
