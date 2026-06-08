import { requireAuth } from "@/lib/auth/require-auth";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * DEPRECATED — standalone drills were removed. This endpoint used to return
 * "today's drill" plus a deep link that the desktop companion turned into a
 * "do your drill" notification. There are no generated drills anymore, so it
 * now always reports "nothing to notify" (`{ sessionId: null }`).
 *
 * It is intentionally NOT deleted: already-installed agents still poll it, and
 * a hard 404 could be misread. Removing the agent's drill notification is a
 * separate agent-app release — this server change alone does not silence
 * installed agents. Bearer auth is preserved so the contract is unchanged.
 *
 * The `200 { sessionId: null }` shape is intentional and confirmed: the agent
 * only fires a notification on a truthy sessionId, so a null reads as "nothing
 * to notify". Retire this endpoint once the agent release that stops polling
 * has rolled out and no old agents remain in the field.
 */
export async function GET(request: NextRequest) {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json({ sessionId: null }, { status: 200 });
}
