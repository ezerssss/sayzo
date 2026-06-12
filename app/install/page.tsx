import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { InstallFlow } from "@/components/install/install-flow";

export const metadata: Metadata = {
    title: "Install the desktop companion",
    description:
        "Download the Sayzo desktop companion for Windows or macOS. We walk you through every step of the install — including exactly what to click.",
};

export default function InstallPage() {
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

            <article className="pb-20">
                <div className="mx-auto w-full max-w-4xl space-y-3 px-6 pt-6 pb-12">
                    <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-sky-700 uppercase">
                        <Download className="size-3.5" />
                        Install
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        Get Sayzo on your computer.
                    </h1>
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        It takes about two minutes, and this page walks you
                        through every click. Once it&apos;s in, Sayzo joins the
                        work calls you choose, shows you how each one went, and
                        lets you replay the moments worth practicing.
                    </p>
                    <ul className="flex flex-wrap gap-2 pt-1">
                        {[
                            "Coaching from your real week",
                            "The exact spots you got stuck",
                            "Stays on your machine until you choose",
                        ].map((point) => (
                            <li
                                key={point}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground"
                            >
                                <span
                                    aria-hidden
                                    className="size-1.5 rounded-full bg-sky-500"
                                />
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>

                <InstallFlow />

                <div className="mx-auto w-full max-w-4xl px-6">
                    <div className="grid gap-8 border-t border-border/70 pt-10 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
                        <section>
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Uninstalling
                            </h2>
                            <p className="mt-2">
                                Remove it the same way you&apos;d remove any
                                other app, through your apps list in Windows
                                Settings, or by dragging it from Applications to
                                the Trash on macOS.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-base font-semibold tracking-tight text-foreground">
                                Not ready yet?
                            </h2>
                            <p className="mt-2">
                                Sayzo needs the desktop companion to bring your
                                real conversations in. You can still open the
                                web app to sign in and look around.{" "}
                                <Link
                                    href="/app"
                                    className="text-foreground underline-offset-4 hover:underline"
                                >
                                    Open Sayzo
                                </Link>
                                .
                            </p>
                        </section>
                    </div>
                </div>
            </article>
        </main>
    );
}
