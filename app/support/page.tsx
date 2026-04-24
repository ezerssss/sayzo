import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SupportForm } from "./support-form";

export const metadata: Metadata = {
    title: "Support — Sayzo",
    description:
        "Something off, a question, or an idea? Reach the Sayzo team here. We read every message.",
};

type SearchParams = Promise<{
    v?: string | string[];
    os?: string | string[];
    uid?: string | string[];
}>;

function pickString(value: string | string[] | undefined): string | undefined {
    if (!value) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = raw?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export default async function SupportPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const params = await searchParams;
    const agentVersion = pickString(params.v);
    const agentOs = pickString(params.os);
    const clientUid = pickString(params.uid);

    return (
        <main className="min-h-screen bg-background">
            <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
                <Link
                    href="/"
                    className="flex items-center gap-2 transition-opacity hover:opacity-80"
                >
                    <Image
                        src="/sayzo-logo.png"
                        alt="Sayzo"
                        width={32}
                        height={32}
                        priority
                    />
                    <span className="text-lg font-semibold tracking-tight">
                        Sayzo
                    </span>
                </Link>
                <Link
                    href="/"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-3.5" />
                    Back to home
                </Link>
            </header>

            <article className="mx-auto w-full max-w-2xl px-6 pt-6 pb-20">
                <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Support
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        How can we help?
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Something off, a question about a drill, or an idea
                        you&apos;d love to see? Drop us a note below — a real
                        person on the Sayzo team reads every message, usually
                        within a day or two.
                    </p>
                </div>

                <div className="mt-8">
                    <SupportForm
                        agentVersion={agentVersion}
                        agentOs={agentOs}
                        clientUid={clientUid}
                    />
                </div>
            </article>

            <footer className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 border-t border-border/70 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
                <span>© {new Date().getFullYear()} Sayzo</span>
                <div className="flex items-center gap-5">
                    <Link
                        href="/"
                        className="transition-colors hover:text-foreground"
                    >
                        Home
                    </Link>
                    <Link
                        href="/privacy"
                        className="transition-colors hover:text-foreground"
                    >
                        Privacy
                    </Link>
                    <Link
                        href="/app"
                        className="transition-colors hover:text-foreground"
                    >
                        Open app →
                    </Link>
                </div>
            </footer>
        </main>
    );
}
