import { processNextCapture } from "@/lib/captures/process";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    // Authenticate with CRON_SECRET
    const authHeader = request.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET?.trim();

    if (!cronSecret) {
        console.error("[api/captures/process] CRON_SECRET is not configured");
        return NextResponse.json(
            { error: "Server misconfiguration" },
            { status: 500 },
        );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const result = await processNextCapture();

        if (!result) {
            return NextResponse.json({ message: "No captures to process" });
        }

        return NextResponse.json({
            captureId: result.captureId,
            previousStatus: result.previousStatus,
            newStatus: result.newStatus,
            ...(result.error ? { error: result.error } : {}),
        });
    } catch (error) {
        console.error("[api/captures/process] POST failed", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Processing failed",
            },
            { status: 500 },
        );
    }
}
