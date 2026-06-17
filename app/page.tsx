import type { Metadata } from "next";

import { LANDING_FAQ } from "@/components/landing/faq";
import { LandingContent } from "@/components/landing/landing-content";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app";

export const metadata: Metadata = {
    // `absolute` bypasses the layout's "%s | Sayzo" template so the homepage
    // title stays clean and leads with the keyword.
    title: {
        absolute: "Sayzo — English speaking coach for your real conversations",
    },
    description:
        "English speaking coach for non-native pros on global teams. Sayzo joins the work calls you choose, coaches every conversation, and replays the moments that matter.",
    alternates: { canonical: "/" },
    openGraph: {
        title: "Sayzo — English speaking coach for your real conversations",
        description:
            "Feedback after every work call, plus a replay to practice the moments that matter. No scripted drills.",
        url: SITE_URL,
        siteName: "Sayzo",
        type: "website",
        // This page defines its own openGraph, which shallow-overrides the
        // layout's — so locale must be repeated here or the homepage loses it.
        locale: "en_US",
        // Image comes from app/opengraph-image.tsx.
    },
    twitter: {
        card: "summary_large_image",
        title: "Sayzo — English speaking coach for your real conversations",
        description:
            "Feedback after every work call, plus a replay to practice the moments that matter.",
        // Image comes from app/twitter-image.tsx.
    },
};

// Structured data for search engines. FAQ entries are pulled from the same
// LANDING_FAQ the page renders, so the rich result and the visible copy stay
// in sync. Content is build-time constant (no user input).
const JSON_LD = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "WebSite",
            name: "Sayzo",
            url: SITE_URL,
            inLanguage: "en",
        },
        {
            "@type": "Organization",
            name: "Sayzo",
            alternateName: "Sayzo English Coach",
            url: SITE_URL,
            logo: `${SITE_URL}/sayzo-logo.png`,
            description:
                "An English speaking coach for non-native professionals on global teams.",
        },
        {
            "@type": "SoftwareApplication",
            name: "Sayzo",
            applicationCategory: "EducationalApplication",
            operatingSystem: "Windows, macOS",
            url: SITE_URL,
            inLanguage: "en",
            description:
                "An English speaking coach that joins your real work calls, gives feedback after each one, and lets you replay the moments worth practicing.",
            featureList: [
                "Feedback after every call",
                "Replay the moments that matter",
                "Coaching for standups, client calls, and interviews",
            ],
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
