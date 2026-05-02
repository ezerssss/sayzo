import { requireAuth } from "@/lib/auth/require-auth";
import { pregenerateNextDrillFor } from "@/services/drill-pre-generator";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Returns today's drill — the user's current pending drill, generating one
 * synchronously if none exists. The desktop helper polls this endpoint to
 * surface a notification + deep link; the dashboard hero can also use it
 * to skip the Firestore listener race when the user opens the app right
 * after finishing a drill.
 *
 * Behavior:
 * - Pending drill exists → returns it.
 * - No pending drill → calls `pregenerateNextDrillFor` synchronously and
 *   returns the new session.
 * - Latest drill is `needs_retry` → 409 (the user must redo it before a
 *   new drill is created).
 * - Over credit limit → 402 (no drill is created; the user needs to upgrade
 *   to keep recording).
 */
function buildDeepLinkUrl(sessionId: string): string {
    const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";
    const trimmed = baseUrl.replace(/\/+$/, "");
    return `${trimmed}/app/drills/${sessionId}`;
}

export async function GET(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    const outcome = await pregenerateNextDrillFor(uid);

    if (outcome.ok) {
        return NextResponse.json({
            sessionId: outcome.session.id,
            deepLinkUrl: buildDeepLinkUrl(outcome.session.id),
            isReplay: outcome.session.type === "scenario_replay",
            scenarioTitle: outcome.session.plan?.scenario?.title ?? "",
            question: outcome.session.plan?.scenario?.question ?? "",
        });
    }

    if (outcome.reason === "no_user") {
        return NextResponse.json(
            { error: "User profile not found." },
            { status: 404 },
        );
    }
    if (outcome.reason === "needs_retry") {
        return NextResponse.json(
            {
                error:
                    outcome.session.completionReason?.trim() ||
                    "Please redo your current drill before getting a new one.",
                code: "DRILL_RETRY_REQUIRED",
                sessionId: outcome.session.id,
                deepLinkUrl: buildDeepLinkUrl(outcome.session.id),
            },
            { status: 409 },
        );
    }
    if (outcome.reason === "still_processing") {
        return NextResponse.json(
            {
                error:
                    "Your last drill is still processing. Wait for it to finish.",
                code: "DRILL_STILL_PROCESSING",
                sessionId: outcome.session.id,
            },
            { status: 409 },
        );
    }
    return NextResponse.json(
        { error: outcome.message || "Failed to fetch today's drill." },
        { status: 500 },
    );
}
