"use client";

import { Check, Smartphone } from "lucide-react";
import type { ReactNode } from "react";

import { SaveLinkActions } from "@/components/mobile/save-link-actions";
import { cn } from "@/lib/utils";

import { DownloadCta } from "./download-cta";
import type { OS } from "./platforms";
import { BrowserWarningReplica } from "./replicas/browser-warning-replica";
import { DmgWindowReplica } from "./replicas/dmg-window-replica";
import { PermissionReplica } from "./replicas/permission-replica";
import { SmartScreenReplica } from "./replicas/smartscreen-replica";

type Step = {
    id: string;
    title: string;
    body: ReactNode;
    visual?: ReactNode;
    // Marked "you might not see this" — the browser double-check doesn't
    // happen for everyone, and a skipped step shouldn't feel like a mistake.
    optional?: boolean;
    // Render the visual below the text instead of beside it — for wide
    // visuals (e.g. two SmartScreen frames) that get squeezed in a column.
    stackedVisual?: boolean;
};

const WINDOWS_STEPS: Step[] = [
    {
        id: "download",
        title: "Download the installer",
        body: (
            <>
                One click — the rest of this guide shows you everything that
                happens after.
            </>
        ),
    },
    {
        id: "browser-check",
        title: "Your browser may double-check the download",
        optional: true,
        body: (
            <>
                Some browsers pause to ask about files they haven&apos;t seen
                many people download. If yours does, click the three dots next
                to the file, then choose{" "}
                <span className="font-medium text-foreground">Keep</span>. If
                you don&apos;t see this, nothing&apos;s wrong — go to the next
                step.
            </>
        ),
        visual: <BrowserWarningReplica />,
    },
    {
        id: "open-file",
        title: "Open the file",
        body: (
            <>
                When the download finishes, click it in your browser — or find{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    sayzo-setup.exe
                </code>{" "}
                in your Downloads folder and double-click it.
            </>
        ),
    },
    {
        id: "smartscreen",
        title: "Tell Windows it’s OK",
        body: (
            <>
                Windows shows a blue caution screen for newer apps it
                doesn&apos;t recognize yet. Click{" "}
                <span className="font-medium text-foreground">More info</span>,
                then{" "}
                <span className="font-medium text-foreground">Run anyway</span>.
                That&apos;s it — it only happens this once.{" "}
                <a
                    href="#windows-caution"
                    className="text-foreground underline underline-offset-4 hover:text-sky-700"
                >
                    Why does this happen?
                </a>
            </>
        ),
        stackedVisual: true,
        visual: (
            <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                <SmartScreenReplica stage="more-info" />
                <SmartScreenReplica stage="run-anyway" />
            </div>
        ),
    },
    {
        id: "setup",
        title: "Follow the quick setup",
        body: (
            <>
                Click through the prompts — it takes about a minute. When
                it&apos;s done, Sayzo opens on its own.
            </>
        ),
    },
    {
        id: "signin",
        title: "Sign in and you’re set",
        body: (
            <>
                Sign in with your Sayzo account. From then on, Sayzo starts
                automatically whenever you sign in to your computer.
            </>
        ),
    },
];

const MACOS_STEPS: Step[] = [
    {
        id: "download",
        title: "Download Sayzo",
        body: (
            <>
                One click — the rest of this guide shows you everything that
                happens after.
            </>
        ),
    },
    {
        id: "drag",
        title: "Drag Sayzo into Applications",
        body: (
            <>
                Double-click{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    Sayzo.dmg
                </code>{" "}
                in your Downloads folder. A small window opens — drag the{" "}
                <span className="font-medium text-foreground">Sayzo</span> icon
                onto the{" "}
                <span className="font-medium text-foreground">
                    Applications
                </span>{" "}
                folder right next to it.
            </>
        ),
        visual: <DmgWindowReplica />,
    },
    {
        id: "open",
        title: "Open Sayzo from Applications",
        body: (
            <>
                Open your Applications folder and double-click{" "}
                <span className="font-medium text-foreground">Sayzo</span>.
                It&apos;s verified by Apple, so it opens right away — no
                warnings.
            </>
        ),
    },
    {
        id: "permissions",
        title: "Allow what your Mac asks for",
        body: (
            <>
                The first time Sayzo runs, your Mac double-checks a few things —
                like using the microphone, so Sayzo can learn from your real
                meetings. Click{" "}
                <span className="font-medium text-foreground">Allow</span> each
                time. You can change any of these later in System Settings.
            </>
        ),
        visual: <PermissionReplica />,
    },
    {
        id: "signin",
        title: "Sign in and you’re set",
        body: (
            <>
                Sign in with your Sayzo account. From then on, Sayzo starts
                automatically whenever you sign in to your Mac.
            </>
        ),
    },
];

const STEPS: Record<OS, Step[]> = {
    windows: WINDOWS_STEPS,
    macos: MACOS_STEPS,
};

export function installStepCount(os: OS): number {
    return STEPS[os].length;
}

export function installStepDomId(stepId: string): string {
    return `install-step-${stepId}`;
}

type Props = {
    os: OS;
    isMobile: boolean;
    downloaded: boolean;
    onDownloaded: () => void;
    // DOM id of the step to softly highlight (after a download click).
    highlightId: string | null;
};

export function InstallSteps({
    os,
    isMobile,
    downloaded,
    onDownloaded,
    highlightId,
}: Readonly<Props>) {
    const steps = STEPS[os];

    return (
        <ol className="mt-8">
            {steps.map((step, idx) => {
                const last = idx === steps.length - 1;
                const first = idx === 0;
                const domId = installStepDomId(step.id);
                const highlighted = highlightId === domId;
                return (
                    <li
                        key={step.id}
                        id={domId}
                        className={cn(
                            "relative flex gap-4 sm:gap-5",
                            last ? "pb-0" : "pb-10",
                        )}
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "pointer-events-none absolute -inset-x-4 -inset-y-3 -z-10 rounded-2xl bg-sky-100/60 transition-opacity duration-1000 dark:bg-sky-900/25",
                                highlighted ? "opacity-100" : "opacity-0",
                            )}
                        />
                        {!last ? (
                            <span
                                aria-hidden
                                className="absolute top-8 bottom-0 left-3.5 w-px bg-border"
                            />
                        ) : null}
                        <span
                            className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                step.optional
                                    ? "border-2 border-dashed border-sky-400 bg-background text-sky-700 dark:text-sky-400"
                                    : "bg-sky-600 text-white ring-4 ring-sky-100 dark:ring-sky-950",
                            )}
                        >
                            {first && downloaded ? (
                                <Check className="size-3.5" />
                            ) : (
                                idx + 1
                            )}
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                            <div
                                className={cn(
                                    step.visual &&
                                        !step.stackedVisual &&
                                        "lg:grid lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start lg:gap-10",
                                )}
                            >
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-semibold tracking-tight text-foreground">
                                            {step.title}
                                        </h3>
                                        {step.optional ? (
                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-medium text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900/60">
                                                You might not see this
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
                                        {step.body}
                                    </p>
                                    {first ? (
                                        <StepOneCta
                                            os={os}
                                            isMobile={isMobile}
                                            downloaded={downloaded}
                                            onDownloaded={onDownloaded}
                                        />
                                    ) : null}
                                </div>
                                {step.visual ? (
                                    <div
                                        className={cn(
                                            "mt-4",
                                            !step.stackedVisual && "lg:mt-0",
                                        )}
                                    >
                                        {step.visual}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function StepOneCta({
    os,
    isMobile,
    downloaded,
    onDownloaded,
}: Readonly<{
    os: OS;
    isMobile: boolean;
    downloaded: boolean;
    onDownloaded: () => void;
}>) {
    if (isMobile) {
        return (
            <div className="mt-4 flex max-w-sm flex-col gap-3">
                <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200/70">
                    <Smartphone className="size-3" />
                    You&apos;re on mobile — save for your computer
                </div>
                <SaveLinkActions source="install_page" layout="stacked" />
                <p className="text-xs text-muted-foreground">
                    Sayzo runs on Windows and macOS. Send yourself the link and
                    finish the install on your computer.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-4">
            <DownloadCta
                os={os}
                analyticsSource="install_page"
                onDownloaded={onDownloaded}
                buttonClassName="w-full sm:w-auto sm:px-8"
            />
            {downloaded ? (
                <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-400">
                    <Check className="size-3.5" />
                    {os === "windows"
                        ? "Download started — below is the caution screen to expect before you open it."
                        : "Download started — next up: drag Sayzo into Applications."}
                </p>
            ) : null}
        </div>
    );
}
