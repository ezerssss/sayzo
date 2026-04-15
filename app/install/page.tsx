import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { InstallPanel } from "@/components/install/install-panel";

export const metadata: Metadata = {
    title: "Install the desktop companion — Sayzo",
    description:
        "One terminal command to install the Sayzo desktop companion. Windows and macOS.",
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

            <article className="mx-auto w-full max-w-2xl px-6 pt-6 pb-20">
                <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Install
                    </p>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        Get the desktop companion running.
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        The companion runs quietly on your machine. It does the
                        heavy processing locally, then hands only the moments
                        worth coaching on back to Sayzo. Pick your platform and
                        paste the one-liner.
                    </p>
                </div>

                <div className="mt-8">
                    <InstallPanel
                        headline="One command"
                        subhead="Open a terminal and paste. The installer handles the rest."
                    />
                </div>

                <div className="mt-10 space-y-6 text-sm leading-relaxed text-muted-foreground">
                    <section>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            What the installer does
                        </h2>
                        <ul className="mt-3 list-inside list-disc space-y-1.5">
                            <li>
                                Drops the Sayzo companion into your user
                                directory — no admin prompts required.
                            </li>
                            <li>
                                Sets it to launch on login, so it&apos;s ready
                                whenever you are.
                            </li>
                            <li>
                                Opens a browser window to finish pairing the
                                companion with your Sayzo account.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            Uninstalling
                        </h2>
                        <p className="mt-2">
                            Stop the background service from your system tray
                            (Windows) or menu bar (macOS), then delete the{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                ~/.sayzo
                            </code>{" "}
                            directory. Nothing else is left behind.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-base font-semibold tracking-tight text-foreground">
                            Not ready yet?
                        </h2>
                        <p className="mt-2">
                            You can use Sayzo&apos;s drills on the web without
                            the companion. The companion just widens the loop
                            — feeding real conversations into your coaching
                            instead of only practice scenarios.{" "}
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
            </article>
        </main>
    );
}
