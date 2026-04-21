import "server-only";

import { openai } from "@ai-sdk/openai";
import { Output, generateText, zodSchema } from "ai";
import { z } from "zod";

import { crawlWebsiteText } from "@/services/web-crawler";
import type { CompanyResearchType } from "@/types/user";

const enrichmentSchema = z.object({
    summary: z.string(),
    guessedIndustry: z.string(),
    keyProducts: z.array(z.string()),
    keyFeatures: z.array(z.string()),
    targetCustomers: z.array(z.string()),
    domainSignals: z.array(z.string()),
    supplementalFacts: z.array(z.string()),
    groundedFacts: z.array(z.string()),
    unknowns: z.array(z.string()),
    confidence: z.enum(["low", "medium", "high"]),
    sourceEvidence: z.array(
        z.object({
            source: z.string(),
            reliability: z.enum(["high", "medium", "low"]),
            highlights: z.array(z.string()),
        }),
    ),
});

type EnrichCompanyContextInput = {
    companyName: string;
    companyUrl?: string;
    companyContext?: string;
    role?: string;
    industry?: string;
};

type SourceSnippet = {
    url: string;
    text: string;
};

function modelName(): string {
    return process.env.PROFILE_BUILDER_MODEL?.trim() || "gpt-4o-mini";
}

function trimList(items: string[], limit: number): string[] {
    return Array.from(
        new Set(items.map((item) => item.trim()).filter((item) => item.length > 0)),
    ).slice(0, limit);
}

async function fetchDuckDuckGo(companyName: string): Promise<SourceSnippet | null> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(companyName)}&format=json&no_html=1&skip_disambig=1`;
    let data: {
        AbstractText?: string;
        Heading?: string;
        AbstractURL?: string;
        Results?: Array<{ FirstURL?: string; Text?: string }>;
        RelatedTopics?: Array<{ Text?: string }>;
    };
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        data = await response.json();
    } catch {
        // DDG occasionally returns empty / non-JSON bodies (rate limits, odd queries).
        return null;
    }
    const related = Array.isArray(data.RelatedTopics)
        ? data.RelatedTopics
              .map((topic) => topic.Text)
              .filter((value): value is string => typeof value === "string")
              .slice(0, 4)
        : [];
    const text = [data.Heading, data.AbstractText, ...related]
        .filter((value): value is string => typeof value === "string")
        .join("\n")
        .trim();
    if (!text) return null;
    const candidateUrl =
        data.AbstractURL?.trim() || data.Results?.[0]?.FirstURL?.trim() || "";
    return {
        url: candidateUrl || "https://api.duckduckgo.com",
        text,
    };
}

async function fetchWikipedia(companyName: string): Promise<SourceSnippet | null> {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(companyName)}&format=json&utf8=1&srlimit=1`;
    let searchBody: { query?: { search?: Array<{ title?: string }> } };
    try {
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return null;
        searchBody = await searchRes.json();
    } catch {
        return null;
    }
    const title = searchBody.query?.search?.[0]?.title?.trim();
    if (!title) return null;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    let summaryBody: {
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
    };
    try {
        const summaryRes = await fetch(summaryUrl);
        if (!summaryRes.ok) return null;
        summaryBody = await summaryRes.json();
    } catch {
        return null;
    }
    const text = summaryBody.extract?.trim();
    if (!text) return null;
    return {
        url:
            summaryBody.content_urls?.desktop?.page ??
            `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        text,
    };
}

export function isCompanyResearchStale(
    research: CompanyResearchType | null | undefined,
): boolean {
    if (!research?.updatedAt) return true;
    const updatedAt = Date.parse(research.updatedAt);
    if (Number.isNaN(updatedAt)) return true;
    const ageMs = Date.now() - updatedAt;
    return ageMs > 1000 * 60 * 60 * 24 * 30;
}

export async function enrichCompanyContext(
    input: EnrichCompanyContextInput,
): Promise<CompanyResearchType | null> {
    const companyName = input.companyName.trim();
    const companyUrl = input.companyUrl?.trim() || "";
    if (!companyName) return null;

    const [ddg, wiki] = await Promise.all([
        fetchDuckDuckGo(companyName),
        fetchWikipedia(companyName),
    ]);
    const fallbackSiteUrl = !companyUrl && ddg?.url ? ddg.url : "";
    const crawledSite = await crawlWebsiteText(companyUrl || fallbackSiteUrl, 3000);
    const site: SourceSnippet | null = crawledSite
        ? { url: crawledSite.url, text: crawledSite.text }
        : null;

    const sources = [ddg, wiki, site].filter(
        (value): value is SourceSnippet => value !== null,
    );
    const sourceSnippetsText =
        sources.length > 0
            ? sources
                  .map((source) => `- Source: ${source.url}\n${source.text}`)
                  .join("\n\n")
            : "(none)";

    const result = await generateText({
        model: openai(modelName()),
        output: Output.object({
            schema: zodSchema(enrichmentSchema),
            name: "CompanyEnrichment",
            description:
                "Grounded company context for planning realistic professional scenarios.",
        }),
        system: `You are a company-context enricher for a professional-English coach.
Use user-provided context as highest priority.
When website scrape exists, treat it as primary grounding.
Use DuckDuckGo/Wikipedia as supplemental evidence, especially when scrape is sparse.
Never claim internal company details unless directly present in user input or sources.
If evidence is weak/conflicting, keep confidence low and list unknowns.
Produce concise, practical facts useful for scenario planning.`,
        prompt: `Company name: ${companyName}
User company context: ${input.companyContext?.trim() || "(none)"}
User role: ${input.role?.trim() || "(none)"}
User industry: ${input.industry?.trim() || "(none)"}

Source snippets:
${sourceSnippetsText}`,
        temperature: 0.1,
    });

    return {
        summary: result.output.summary.trim(),
        guessedIndustry: result.output.guessedIndustry.trim(),
        keyProducts: trimList(result.output.keyProducts, 8),
        keyFeatures: trimList(result.output.keyFeatures, 12),
        targetCustomers: trimList(result.output.targetCustomers, 8),
        domainSignals: trimList(result.output.domainSignals, 10),
        supplementalFacts: trimList(result.output.supplementalFacts, 10),
        groundedFacts: trimList(result.output.groundedFacts, 8),
        unknowns: trimList(result.output.unknowns, 5),
        confidence: result.output.confidence,
        sources: trimList(
            sources.map((source) => source.url),
            5,
        ),
        sourceEvidence: result.output.sourceEvidence.map((item) => ({
            source: item.source.trim(),
            reliability: item.reliability,
            highlights: trimList(item.highlights, 4),
        })),
        updatedAt: new Date().toISOString(),
    };
}
