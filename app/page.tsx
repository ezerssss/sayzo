import type { Metadata } from "next";

import { LANDING_FAQ } from "@/components/landing/faq";
import { LandingContent } from "@/components/landing/landing-content";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";

export const metadata: Metadata = {
    // `absolute` bypasses the layout's "%s | Sayzo" template so the homepage
    // title stays clean.
    title: {
        absolute: "Sayzo: coaching from your real work conversations",
    },
    description:
        "Sayzo joins the work calls you choose and coaches your English: feedback after every conversation, and a replay to practice the moments that matter. No scripted drills.",
    alternates: { canonical: "/" },
    openGraph: {
        title: "Sayzo: coaching from your real work conversations",
        description:
            "Feedback after every work call, plus a replay to practice the moments that matter. No scripted drills.",
        url: SITE_URL,
        siteName: "Sayzo",
        type: "website",
        images: ["/sayzo-logo.png"],
    },
    twitter: {
        card: "summary_large_image",
        title: "Sayzo: coaching from your real work conversations",
        description:
            "Feedback after every work call, plus a replay to practice the moments that matter.",
        images: ["/sayzo-logo.png"],
    },
};

// Structured data for search engines. FAQ entries are pulled from the same
// LANDING_FAQ the page renders, so the rich result and the visible copy stay
// in sync. Content is build-time constant (no user input).
const JSON_LD = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            name: "Sayzo",
            url: SITE_URL,
            logo: `${SITE_URL}/sayzo-logo.png`,
        },
        {
            "@type": "SoftwareApplication",
            name: "Sayzo",
            applicationCategory: "EducationalApplication",
            operatingSystem: "Windows, macOS",
            url: SITE_URL,
            description:
                "An English speaking coach that joins your real work calls, gives feedback after each one, and lets you replay the moments worth practicing.",
            offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
            },
        },
        {
            "@type": "FAQPage",
            mainEntity: LANDING_FAQ.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: {
                    "@type": "Answer",
                    text: item.answer,
                },
            })),
        },
    ],
};

export default function LandingPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
            />
            <LandingContent />
        </>
    );
}
