import {
    analyzeSession,
    generateSessionFeedback,
} from "@/services/analyzer";
import type { SessionFeedbackType } from "@/types/sessions";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const body = (await request.json()) as {
        transcript?: string;
        drillType?: string;
        drillTitle?: string;
    };

    const transcript = body.transcript?.trim();
    if (!transcript) {
        return NextResponse.json(
            { error: "Missing transcript." },
            { status: 400 },
        );
    }

    const drillTitle = body.drillTitle ?? "Speaking drill";
    const drillType = body.drillType ?? "self_introduction";

    // Use the real analysis + feedback pipeline with a minimal profile
    const minimalProfile = {
        role: "",
        industry: "",
        companyName: "",
        companyDescription: "",
        workplaceCommunicationContext: "",
        wantsInterviewPractice: false,
        motivation: "",
        goals: [],
        additionalContext: "",
        companyResearch: null,
    };

    const emptySkillMemory = {
        strengths: [],
        weaknesses: [],
        masteredFocus: [],
        reinforcementFocus: [],
    };

    const sessionContext = {
        plan: {
            scenario: {
                title: drillTitle,
                situationContext: "",
                givenContent: "",
                framework: "",
                category: drillType,
            },
            skillTarget: "Baseline communication assessment",
            maxDurationSeconds: 120,
        },
        transcript,
    };

    // Coaching section keys ranked by typical importance for onboarding preview
    const COACHING_KEYS: Array<keyof SessionFeedbackType> = [
        "momentsToTighten",
        "clarityAndConciseness",
        "structureAndFlow",
        "engagement",
        "deliveryAndProsody",
        "relevanceAndFocus",
        "professionalism",
    ];

    try {
        const analysis = await analyzeSession({
            userProfile: minimalProfile,
            skillMemory: emptySkillMemory,
            session: sessionContext,
        });

        const feedback = await generateSessionFeedback(
            {
                userProfile: minimalProfile,
                skillMemory: emptySkillMemory,
                session: sessionContext,
            },
            { sessionAnalysis: analysis },
        );

        // Pick top 2 coaching sections that have the most substance
        const topKeys = COACHING_KEYS.filter((k) => {
            const v = feedback[k];
            return typeof v === "string" && v.trim().length > 0;
        }).slice(0, 2);

        const response: SessionFeedbackType & {
            topCoachingKeys: string[];
        } = {
            ...feedback,
            topCoachingKeys: topKeys,
        };

        return NextResponse.json(response);
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to generate feedback.",
            },
            { status: 500 },
        );
    }
}
