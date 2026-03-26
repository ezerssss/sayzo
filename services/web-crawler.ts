import "server-only";

import Crawler from "crawler";

function normalizeUrl(raw: string | undefined): string {
    const value = raw?.trim();
    if (!value) return "";
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return `https://${value}`;
}

function htmlToText(html: string): string {
    const withoutScripts = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");
    return withoutScripts.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function crawlWithJinaFallback(
    url: string,
    maxChars: number,
): Promise<{ url: string; text: string } | null> {
    const readerUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(readerUrl, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; EloquyBot/1.0)",
            },
        });
        if (!response.ok) return null;
        const text = (await response.text()).replace(/\s+/g, " ").trim();
        if (!text) return null;
        return { url: readerUrl, text: text.slice(0, maxChars) };
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function crawlWebsiteText(
    rawUrl: string | undefined,
    maxChars = 3000,
): Promise<{ url: string; text: string } | null> {
    const url = normalizeUrl(rawUrl);
    if (!url) return null;

    const crawlWithCrawler = () =>
        new Promise<{ url: string; text: string } | null>((resolve) => {
        const crawler = new Crawler({
            maxConnections: 1,
            timeout: 30000,
        });

        crawler.queue({
            uri: url,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; EloquyBot/1.0)",
            },
            callback: (
                error: unknown,
                res: { body?: string },
                done?: unknown,
            ) => {
                const finish =
                    typeof done === "function" ? (done as () => void) : null;
                if (error || !res?.body) {
                    finish?.();
                    resolve(null);
                    return;
                }
                const text = htmlToText(res.body).slice(0, maxChars);
                finish?.();
                if (!text) {
                    resolve(null);
                    return;
                }
                resolve({ url, text });
            },
        });
    });

    const crawlWithFetchFallback = async (): Promise<{
        url: string;
        text: string;
    } | null> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; EloquyBot/1.0)",
                },
            });
            if (!response.ok) return null;
            const html = await response.text();
            const text = htmlToText(html).slice(0, maxChars);
            if (!text) return null;
            return { url, text };
        } catch {
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const firstTry = await crawlWithCrawler();
    if (firstTry?.text) return firstTry;

    // One more attempt via crawler to handle transient network errors.
    const secondTry = await crawlWithCrawler();
    if (secondTry?.text) return secondTry;

    const fallback = await crawlWithFetchFallback();
    if (fallback?.text) return fallback;

    const jina = await crawlWithJinaFallback(url, maxChars);
    if (jina?.text) return jina;

    return null;
}
