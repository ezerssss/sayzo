"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";

import { track } from "@/lib/analytics/client";

/**
 * Plain-language reassurance for the Windows caution screen, rendered as a
 * full-bleed tinted band. Windows flow only; linked from the download CTA
 * areas and step 4 via #windows-caution.
 */
export function WindowsCautionSection() {
    const sectionRef = useRef<HTMLElement | null>(null);
    const firedRef = useRef(false);

    useEffect(() => {
        const node = sectionRef.current;
        if (!node || typeof IntersectionObserver === "undefined") return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (firedRef.current) return;
                if (entries.some((entry) => entry.isIntersecting)) {
                    firedRef.current = true;
                    track("install_caution_section_viewed", { os: "windows" });
                    observer.disconnect();
                }
            },
            { threshold: 0.4 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    return (
        <section
            ref={sectionRef}
            id="windows-caution"
            className="scroll-mt-24 border-y border-sky-100 bg-sky-50/50 dark:border-sky-950/60 dark:bg-sky-950/20"
        >
            <div className="mx-auto w-full max-w-4xl px-6 py-12">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-400">
                        <ShieldCheck className="size-5" />
                    </span>
                    <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                        Why does Windows show a caution screen?
                    </h2>
                </div>

                <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                        <p>
                            When an app is new and hasn&apos;t been downloaded
                            by many people yet, Windows plays it safe: it shows
                            a caution screen until it learns to recognize the
                            app — even when nothing is wrong with it. Sayzo for
                            Windows is still going through that recognition
                            process, so you&apos;ll see the screen once, the
                            first time you install.
                        </p>
                        <p>
                            On Mac this doesn&apos;t happen — Apple&apos;s
                            verification of Sayzo is already complete, so the
                            app opens without any warnings. The same
                            verification for Windows is in progress, and once
                            it&apos;s done this screen disappears for everyone.
                        </p>
                    </div>

                    <div className="rounded-xl border border-sky-200/70 bg-card p-4 shadow-sm dark:border-sky-900/50">
                        <p className="text-sm font-semibold tracking-tight text-foreground">
                            Clicking{" "}
                            <span className="text-sky-700 dark:text-sky-400">
                                More info
                            </span>{" "}
                            →{" "}
                            <span className="text-sky-700 dark:text-sky-400">
                                Run anyway
                            </span>{" "}
                            is safe when:
                        </p>
                        <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                            <li className="flex gap-2">
                                <Check className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                <span>
                                    You downloaded it from{" "}
                                    <span className="font-medium text-foreground">
                                        sayzo.app
                                    </span>{" "}
                                    — this site.
                                </span>
                            </li>
                            <li className="flex gap-2">
                                <Check className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
                                <span>
                                    The file is named exactly{" "}
                                    <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
                                        sayzo-setup.exe
                                    </code>
                                    .
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}
