import { enrichCompanyContext } from "@/services/company-context-enricher";
import { NextResponse, type NextRequest } from "next/server";

type CompanyResearchPayload = {
    companyName: string;
    companyUrl?: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    let payload: CompanyResearchPayload;
    try {
        payload = (await request.json()) as CompanyResearchPayload;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const companyName = payload.companyName?.trim();
    const companyUrl = payload.companyUrl?.trim() || "";
    if (!companyName) {
        return NextResponse.json(
            { error: "Missing companyName." },
            { status: 400 },
        );
    }

    try {
        const enrichment = await enrichCompanyContext({
            companyName,
            companyUrl,
        });
        if (!enrichment) {
            return NextResponse.json(
                { error: "Company research failed." },
                { status: 500 },
            );
        }
        return NextResponse.json({
            summary: enrichment.summary,
            guessedIndustry: enrichment.guessedIndustry,
            confidence: enrichment.confidence,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Company research failed.",
            },
            { status: 500 },
        );
    }
}
