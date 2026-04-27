"use client";

import { Apple, Monitor, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { detectOS, InstallPanel, type OS, PLATFORMS } from "./install-panel";

type Step = {
    title: string;
    body: ReactNode;
};

function windowsSteps(fileName: string): Step[] {
    return [
        {
            title: "Open the installer",
            body: (
                <>
                    Once the download finishes, click{" "}
                    <span className="text-foreground">Open</span> in your
                    browser — or find{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {fileName}
                    </code>{" "}
                    in your Downloads folder and double-click it.
                </>
            ),
        },
        {
            title: "Follow the quick setup",
            body: (
                <>
                    Click through the prompts — it takes about a minute. When
                    it&apos;s done, Sayzo opens on its own.
                </>
            ),
        },
        {
            title: "Sign in and you’re set",
            body: (
                <>
                    Sign in with your Sayzo account. From then on, Sayzo
                    starts automatically whenever you sign in to your computer.
                </>
            ),
        },
    ];
}

function macosSteps(fileName: string): Step[] {
    return [
        {
            title: "Open the file you downloaded",
            body: (
                <>
                    Double-click{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {fileName}
                    </code>{" "}
                    in your Downloads folder. A small window pops up with the
                    Sayzo icon and a shortcut to your Applications folder.
                </>
            ),
        },
        {
            title: "Drag Sayzo into Applications",
            body: (
                <>
                    In that window, drag the{" "}
                    <span className="text-foreground">Sayzo</span> icon onto
                    the{" "}
                    <span className="text-foreground">Applications</span>{" "}
                    shortcut right next to it. That copies it onto your Mac.
                </>
            ),
        },
        {
            title: "Open Sayzo from Applications",
            body: (
                <>
                    Open your Applications folder and double-click{" "}
                    <span className="text-foreground">Sayzo</span>. When it
                    asks for microphone access, allow it so Sayzo can learn
                    from your real meetings.
                </>
            ),
        },
        {
            title: "Sign in and you’re set",
            body: (
                <>
                    Sign in with your Sayzo account. From then on, Sayzo
                    starts automatically whenever you sign in to your Mac.
                </>
            ),
        },
    ];
}

type Props = {
    headline?: string;
    subhead?: string;
};

export function InstallFlow(props: Readonly<Props>) {
    const [os, setOS] = useState<OS>("windows");

    useEffect(() => {
        // Client-only UA detection after hydration; SSR must render the default to match.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOS(detectOS());
    }, []);

    const active = PLATFORMS[os];
    const steps =
        os === "macos"
            ? macosSteps(active.fileName)
            : windowsSteps(active.fileName);
    const OSIcon = os === "macos" ? Apple : Monitor;

    return (
        <div className="space-y-6">
            <InstallPanel
                {...props}
                os={os}
                onOSChange={setOS}
                analyticsSource="install_page"
            />

            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700">
                    <Sparkles className="size-3.5" />
                    Install guide
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">
                        How to install on {active.label}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest text-sky-700 ring-1 ring-sky-200/70">
                        <OSIcon className="size-2.5" />
                        {active.label}
                    </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                    {steps.length} steps. No technical setup.
                </p>

                <ol className="mt-4 space-y-4">
                    {steps.map((step, idx) => (
                        <li key={idx} className="flex gap-3">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xs font-semibold text-white ring-1 ring-sky-200/60">
                                {idx + 1}
                            </span>
                            <div className="flex-1 pt-0.5">
                                <p className="text-sm font-medium text-foreground">
                                    {step.title}
                                </p>
                                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                                    {step.body}
                                </p>
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
