import { redirect } from "next/navigation";

/**
 * Deprecated route. Standalone drills were removed and the replay player moved
 * to /app/replays/[id]. Kept as a thin server-side redirect for a grace period
 * so old links, bookmarks, and in-flight desktop-agent notifications resolve
 * instead of 404ing. Safe to delete once no old agents remain in the field.
 */
export default async function LegacyDrillRedirect({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const { sessionId } = await params;
    if (sessionId && sessionId !== "latest") {
        redirect(`/app/replays/${sessionId}`);
    }
    redirect("/app");
}
