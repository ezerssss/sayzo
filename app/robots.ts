import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // The signed-in app is auth-gated and user-specific, so keep it
            // out of the index. The public marketing pages stay crawlable.
            disallow: ["/app", "/app/"],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
