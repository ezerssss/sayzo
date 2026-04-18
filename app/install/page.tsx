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
                        Bring Sayzo into your real meetings.
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Drills in the browser show you what Sayzo feels like.
                        The desktop companion is what turns it into a coach
                        that knows your actual work — the standups you lead,
                        the client calls you ran this week, the 1:1 that
                        didn&apos;t go how you wanted.
                    </p>
                </div>

                <div className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
                    <h2 className="text-sm font-semibold tracking-tight">
                        What the companion gives you
                    </h2>
                    <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                        <li className="flex gap-2.5">
                            <span
                                aria-hidden
                                className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-foreground/60"
                            />
                            <span>
                                <span className="text-foreground">
                                    Drills tuned to your actual week.
                                </span>{" "}
                                Each new drill comes from the meetings you
                                just had — not a generic curriculum.
                            </span>
                        </li>
                        <li className="flex gap-2.5">
                            <span
                                aria-hidden
                                className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-foreground/60"
                            />
                            <span>
                                <span className="text-foreground">
                                    Coaching on the exact spots you got stuck.
                                </span>{" "}
                                The moment you hesitated, the point that
                                didn&apos;t land, the answer you wish you had
                                ready — surfaced while it&apos;s still fresh.
                            </span>
                        </li>
                        <li className="flex gap-2.5">
                            <span
                                aria-hidden
                                className="mt-[0.55rem] size-1 shrink-0 rounded-full bg-foreground/60"
                            />
                            <span>
                                <span className="text-foreground">
                                    Everything stays local until you choose.
                                </span>{" "}
                                Processing happens on your machine. Only the
                                moments worth coaching on are sent to Sayzo,
                                and you can review them first.
                            </span>
                        </li>
                    </ul>
                </div>

                <div className="mt-6">
                    <InstallPanel
                        headline="Install it"
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
                            the companion. You&apos;ll just be practicing with
                            generated scenarios instead of the ones from your
                            actual week.{" "}
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
