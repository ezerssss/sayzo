"use client";

import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    Ear,
    Gauge,
    Lock,
    Mic,
    Shield,
    Sparkles,
    Wand2,
    Waves,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
    return (
        <main className="min-h-screen bg-background">
            <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
                <div className="flex items-center gap-2">
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
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <Link
                        href="/privacy"
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "hidden text-muted-foreground sm:inline-flex",
                        )}
                    >
                        Privacy
                    </Link>
                    <Link
                        href="/app"
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                        )}
                    >
                        Sign in
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <section className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-3xl flex-col items-center justify-center px-6 pb-12 text-center">
                <Image
                    src="/sayzo-logo.png"
                    alt="Sayzo logo"
                    width={120}
                    height={120}
                    priority
                    className="mb-8"
                />
                <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    An English coach, tuned to you.
                </p>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Practice the English
                    <br />
                    you actually speak.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    Coaching for the moments your English almost lands —
                    the demo sentence that came out sideways, the interview
                    answer you replayed the whole drive home, the point
                    that didn&apos;t quite cut through in the meeting.
                    Drilled until they do.
                </p>
                <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
                    <Link
                        href="/app"
                        className={cn(
                            buttonVariants({ variant: "default", size: "lg" }),
                            "px-5",
                        )}
                    >
                        Open Sayzo
                        <ArrowRight />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        Sign in with Google to get started.
                    </p>
                </div>
            </section>

            {/* The loop */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        A coach that learns from how you actually sound.
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        Most English apps hand you imagined scenarios. Sayzo
                        starts from real ones. Your conversations shape your
                        coaching — and your coaching reshapes your next
                        conversation.
                    </p>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-3">
                    <StepCard
                        step="01"
                        icon={<Ear className="size-5" />}
                        title="Connect in a minute"
                        body="Sign in with Google, run a few quick drills, and Sayzo builds your profile from how you already sound. That's the setup."
                    />
                    <StepCard
                        step="02"
                        icon={<Wand2 className="size-5" />}
                        title="Sayzo learns your patterns"
                        body="As you go about your work, Sayzo picks up on the spots where you hesitate, the words you lean on, the structures that get away from you, and the moments your tone shines."
                    />
                    <StepCard
                        step="03"
                        icon={<Mic className="size-5" />}
                        title="Drills built for your week"
                        body="Short, targeted speaking drills aimed at the exact places you got stuck — in the scenarios you actually face, not the ones an app imagined."
                    />
                </div>
            </section>

            {/* Drills preview */}
            <section className="border-y border-border/70 bg-muted/30">
                <div className="mx-auto w-full max-w-5xl px-6 py-20">
                    <div className="mx-auto max-w-2xl text-center">
                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                            Drills tuned to the rooms you&apos;re in.
                        </h2>
                        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                            Each drill is a short scenario, a prompt, and a
                            mic. Speak a response, and Sayzo comes back with
                            coaching, a cleaner way to say what you meant,
                            and one takeaway worth remembering.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <DrillCard
                            icon={<Sparkles className="size-4" />}
                            title="Structure & flow"
                            body="Turn rambly answers into something the room can follow in real time."
                        />
                        <DrillCard
                            icon={<Waves className="size-4" />}
                            title="Clarity & word choice"
                            body="Swap placeholder phrases for specific vocabulary that actually lands."
                        />
                        <DrillCard
                            icon={<Gauge className="size-4" />}
                            title="Fluency & pace"
                            body="Fewer fillers, less hesitation, more confident pauses."
                        />
                        <DrillCard
                            icon={<Mic className="size-4" />}
                            title="Voice & tone"
                            body="Sound like you mean it — especially when the stakes are real."
                        />
                    </div>
                    <div className="mt-10 flex flex-col items-center gap-3 text-center">
                        <p className="max-w-xl text-sm text-muted-foreground">
                            Every drill is generated for your role, your
                            goals, and the patterns Sayzo notices in your
                            speaking — from standups to stakeholder pitches to
                            small talk before a call starts.
                        </p>
                    </div>
                </div>
            </section>

            {/* Privacy strip */}
            <section className="mx-auto w-full max-w-5xl px-6 py-20">
                <div className="grid items-start gap-6 rounded-2xl border border-border/70 bg-card p-8 shadow-sm sm:grid-cols-[auto_1fr] sm:gap-10">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <Shield className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight">
                            Private by design.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            Sayzo only works with what&apos;s worth coaching
                            on — the rest never leaves your world. You can
                            review anything before it becomes a drill, delete
                            any conversation at any time, and sign out to
                            stop contributing new data in seconds.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                                <Lock className="size-3.5" />
                                Local-first processing
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Shield className="size-3.5" />
                                You control what&apos;s shared
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="size-3.5" />
                                Deletable, always
                            </span>
                        </div>
                        <Link
                            href="/privacy"
                            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
                        >
                            Read the privacy policy
                            <ArrowRight className="size-3.5" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* How Sayzo is different */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        Not another phrase app.
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        Most tools teach English in a vacuum. Sayzo coaches
                        you inside the life you already live.
                    </p>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-3">
                    <CompareCard
                        versus="vs. gamified apps"
                        title="Real situations, not streaks"
                        body="Owl combos and flashcard decks won't prepare you for a status update. Sayzo drills the moments you'll actually be in this week."
                    />
                    <CompareCard
                        versus="vs. scheduled tutors"
                        title="Available when you are"
                        body="No calendar tetris, no hour-long sessions. A focused thirty minutes, whenever you have them."
                    />
                    <CompareCard
                        versus="vs. transcription tools"
                        title="Coaching, not archiving"
                        body="Otter hands you a transcript. Sayzo hands you what to do about it."
                    />
                </div>
            </section>

            {/* Final CTA */}
            <section className="mx-auto w-full max-w-3xl px-6 pb-24 text-center">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Speak better, one real conversation at a time.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                    Start with a few drills today. In thirty days, hear the
                    difference.
                </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href="/app"
                        className={cn(
                            buttonVariants({ variant: "default", size: "lg" }),
                            "px-5",
                        )}
                    >
                        Open Sayzo
                        <ArrowRight />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        Free to try. No credit card.
                    </p>
                </div>
            </section>

            <footer className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 border-t border-border/70 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
                <span>© {new Date().getFullYear()} Sayzo</span>
                <div className="flex items-center gap-5">
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

function StepCard({
    step,
    icon,
    title,
    body,
}: {
    step: string;
    icon: React.ReactNode;
    title: string;
    body: string;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                    {icon}
                </div>
                <span className="font-mono text-xs tracking-widest text-muted-foreground">
                    {step}
                </span>
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight">
                {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
            </p>
        </div>
    );
}

function DrillCard({
    icon,
    title,
    body,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
                {icon}
            </div>
            <h3 className="mt-3 text-sm font-semibold tracking-tight">
                {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {body}
            </p>
        </div>
    );
}

function CompareCard({
    versus,
    title,
    body,
}: {
    versus: string;
    title: string;
    body: string;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {versus}
            </p>
            <h3 className="mt-2 text-base font-semibold tracking-tight">
                {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
            </p>
        </div>
    );
}
