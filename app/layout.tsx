import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AnalyticsDeviceSync } from "@/components/analytics/analytics-device-sync";
import { AnalyticsUserSync } from "@/components/analytics/analytics-user-sync";

import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    metadataBase: new URL(
        process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://sayzo.app",
    ),
    title: {
        // Leads with the query Sayzo owns ("English speaking coach") while
        // keeping the brand and "conversations" wording. Child pages append
        // " | Sayzo" via the template; the homepage overrides with `absolute`.
        default: "Sayzo — English speaking coach for your real conversations",
        template: "%s | Sayzo",
    },
    description:
        "English speaking coach for non-native pros on global teams. Sayzo joins the calls you choose, coaches every conversation, and replays the moments that matter.",
    applicationName: "Sayzo",
    // Site ownership for Search Console. Read from env so the token is never
    // committed; omitted from the head when unset.
    verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION },
    robots: {
        index: true,
        follow: true,
        // Opt into large image thumbnails and full text snippets in results.
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
    openGraph: {
        title: "Sayzo — English speaking coach for your real conversations",
        description:
            "Coaching from your real work conversations. Feedback after every call, plus a replay to practice.",
        siteName: "Sayzo",
        type: "website",
        locale: "en_US",
        // Image comes from app/opengraph-image.tsx (inherited by every route).
    },
    twitter: {
        card: "summary_large_image",
        title: "Sayzo — English speaking coach for your real conversations",
        description:
            "Coaching from your real work conversations. Feedback after every call, plus a replay to practice.",
        // Image comes from app/twitter-image.tsx.
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#ffffff" },
        { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">
                <AnalyticsUserSync />
                <AnalyticsDeviceSync />
                {children}
            </body>
        </html>
    );
}
