import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";

// Stable date so the sitemap doesn't claim every page changed on each deploy
// (which trains crawlers to distrust the signal). Bump when content materially
// changes.
const LAST_MODIFIED = new Date("2026-06-18");

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = ["", "/install", "/privacy"];
    return routes.map((path) => ({
        url: `${SITE_URL}${path}`,
        lastModified: LAST_MODIFIED,
        changeFrequency: "monthly",
        priority: path === "" ? 1 : 0.7,
    }));
}
