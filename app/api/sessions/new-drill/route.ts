import { pregenerateNextDrillFor } from "@/services/drill-pre-generator";
import { requireAuth } from "@/lib/auth/require-auth";
import { NextResponse, type NextRequest } from "next/server";

type NewDrillPayload = { category?: string };

export const runtime = "nodejs";

/**
 * Explicit user-initiated drill creation. Used by the "Want a different
 * drill?" escape hatch on the home page (with a category) and by the
 * "Start another drill" button on the feedback page.
 *
 * `forceFresh: true` ensures the previous pending drill (if any) is marked
 * skipped before a new one is created, so the dashboard hero always shows
 * the latest auto-pick.
 *
 * Note: this endpoint no longer charges a credit. Credit consumption was
 * moved to `POST /api/sessions/complete` so pre-generated drills cost
 * nothing until the user actually records.
 */
export async function POST(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { uid } = auth;

    let payload: NewDrillPayload;
    try {
        payload = (await request.json()) as NewDrillPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 },
        );
    }

    const requestedCategory = payload.category?.trim() || undefined;

    const outcome = await pregenerateNextDrillFor(uid, {
        forceFresh: true,
        requestedCategory,
    });

    if (outcome.ok) {
        return NextResponse.json({ session: outcome.session });
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
                    "Please redo your current drill before creating a new one.",
                code: "DRILL_RETRY_REQUIRED",
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
            },
            { status: 409 },
        );
    }
    return NextResponse.json(
        { error: outcome.message || "Failed to create new drill." },
        { status: 500 },
    );
}
