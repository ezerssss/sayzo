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
        default: "Sayzo: coaching from your real work conversations",
        template: "%s | Sayzo",
    },
    description:
        "Sayzo joins the work calls you choose and coaches your English: feedback after every conversation, and a replay to practice the moments that matter.",
    applicationName: "Sayzo",
    robots: { index: true, follow: true },
    openGraph: {
        title: "Sayzo",
        description:
            "Coaching from your real work conversations. Feedback after every call, plus a replay to practice.",
        siteName: "Sayzo",
        type: "website",
        images: ["/sayzo-logo.png"],
    },
    twitter: {
        card: "summary_large_image",
        title: "Sayzo",
        description:
            "Coaching from your real work conversations. Feedback after every call, plus a replay to practice.",
        images: ["/sayzo-logo.png"],
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
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
