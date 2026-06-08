import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";

export default function sitemap(): MetadataRoute.Sitemap {
    const routes = ["", "/install", "/privacy"];
    return routes.map((path) => ({
        url: `${SITE_URL}${path}`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: path === "" ? 1 : 0.7,
    }));
}
