import {
    buildUserProfileFieldsFromDrills,
    type OnboardingDrillTranscript,
} from "@/services/profile-context-builder";
import { NextResponse, type NextRequest } from "next/server";

type ExtractProfilePayload = {
    drills: OnboardingDrillTranscript[];
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const body = (await request.json()) as ExtractProfilePayload;

    if (!Array.isArray(body.drills) || body.drills.length === 0) {
        return NextResponse.json(
            { error: "Missing drill transcripts." },
            { status: 400 },
        );
    }

    const hasTranscript = body.drills.some(
        (d) => d.transcript?.trim().length > 0,
    );
    if (!hasTranscript) {
        return NextResponse.json(
            { error: "All drill transcripts are empty." },
            { status: 400 },
        );
    }

    try {
        const fields = await buildUserProfileFieldsFromDrills({
            drills: body.drills,
        });
        return NextResponse.json(fields);
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to extract profile.",
            },
            { status: 500 },
        );
    }
}
