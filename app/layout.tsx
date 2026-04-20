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
    title: "Sayzo — An English coach, tuned to you.",
    description:
        "Short, personalized speaking drills built from the English you actually use at work. Meetings, demos, interviews, client calls. Hear the difference in weeks.",
    openGraph: {
        title: "Sayzo — An English coach, tuned to you.",
        description:
            "Short, personalized speaking drills built from the English you actually use at work.",
        type: "website",
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
