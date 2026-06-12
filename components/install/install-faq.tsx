"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";

import { track } from "@/lib/analytics/client";

import { type OS, PLATFORMS } from "./platforms";

type FaqItem = {
    id: string;
    os: OS | "both";
    question: string;
    answer: ReactNode;
};

const FAQ_ITEMS: FaqItem[] = [
    {
        id: "clicked_dont_run",
        os: "windows",
        question: "I clicked “Don’t run” — did I break something?",
        answer: (
            <>
                Not at all. Open{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    sayzo-setup.exe
                </code>{" "}
                again from your Downloads folder, and this time click{" "}
                <span className="font-medium text-foreground">More info</span>,
                then{" "}
                <span className="font-medium text-foreground">Run anyway</span>.
            </>
        ),
    },
    {
        id: "cant_find_download",
        os: "windows",
        question: "I can’t find the download",
        answer: (
            <>
                Look in your Downloads folder. In most browsers, pressing{" "}
                <span className="font-medium text-foreground">Ctrl + J</span>{" "}
                also opens a list of your recent downloads.
            </>
        ),
    },
    {
        id: "antivirus_flagged",
        os: "windows",
        question: "My antivirus flagged the file",
        answer: (
            <>
                That&apos;s the same caution Windows shows: the file is new, so
                security tools play it safe. Check that you downloaded it from
                sayzo.app and that it&apos;s named exactly{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    sayzo-setup.exe
                </code>
                . If your antivirus removed it, download it again from this
                page.
            </>
        ),
    },
    {
        id: "no_run_anyway",
        os: "windows",
        question: "There’s no “Run anyway” button",
        answer: (
            <>
                Some computers — usually work machines — have stricter settings
                that don&apos;t allow apps Windows doesn&apos;t recognize yet.
                If it&apos;s a work computer, your IT team can install Sayzo for
                you. We&apos;re finishing Windows&apos; recognition process, so
                this restriction will stop applying.
            </>
        ),
    },
    {
        id: "caution_every_time",
        os: "windows",
        question: "Will I see the caution screen every time?",
        answer: (
            <>
                No — only the first time you install. And once Windows finishes
                recognizing Sayzo, it won&apos;t appear for anyone.
            </>
        ),
    },
    {
        id: "mic_not_working",
        os: "macos",
        question: "Sayzo can’t hear my meetings",
        answer: (
            <>
                Open{" "}
                <span className="font-medium text-foreground">
                    System Settings
                </span>
                , go to{" "}
                <span className="font-medium text-foreground">
                    Privacy &amp; Security
                </span>
                , then{" "}
                <span className="font-medium text-foreground">Microphone</span>,
                and turn on Sayzo. Anything else Sayzo asked about during setup
                lives in that same Privacy &amp; Security list.
            </>
        ),
    },
    {
        id: "opened_from_dmg",
        os: "macos",
        question: "I opened Sayzo straight from the downloaded file",
        answer: (
            <>
                Close Sayzo, drag the Sayzo icon into Applications (step 2), and
                open it from there instead. That keeps it on your Mac for good.
            </>
        ),
    },
    {
        id: "records_everything",
        os: "both",
        question: "Does Sayzo listen to everything I say?",
        answer: (
            <>
                No. Sayzo joins the work calls you choose, and after each one
                you can review what it picked out before anything becomes part
                of your coaching.
            </>
        ),
    },
    {
        id: "supported_versions",
        os: "both",
        question: "Which computers does it work on?",
        answer: (
            <>
                {PLATFORMS.windows.minOS}, and Macs running{" "}
                {PLATFORMS.macos.minOS}.
            </>
        ),
    },
];

export function InstallFaq({ os }: Readonly<{ os: OS }>) {
    const openedRef = useRef<Set<string>>(new Set());

    const items = FAQ_ITEMS.filter(
        (item) => item.os === os || item.os === "both",
    );

    const handleToggle = (item: FaqItem, open: boolean) => {
        if (!open || openedRef.current.has(item.id)) return;
        openedRef.current.add(item.id);
        track("install_faq_opened", { os, question_id: item.id });
    };

    return (
        <section>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Quick answers
            </h2>
            <div className="mt-5 grid items-start gap-3 sm:grid-cols-2">
                {items.map((item) => (
                    <details
                        key={item.id}
                        className="group rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm"
                        onToggle={(event) =>
                            handleToggle(item, event.currentTarget.open)
                        }
                    >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                            {item.question}
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {item.answer}
                        </p>
                    </details>
                ))}
            </div>
        </section>
    );
}
