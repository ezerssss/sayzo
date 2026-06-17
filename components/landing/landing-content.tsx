"use client";

import Image from "next/image";
import Link from "next/link";
import {
    ArrowRight,
    Gauge,
    Lock,
    Mic,
    Shield,
    Sparkles,
    Wand2,
    Waves,
} from "lucide-react";

import { LANDING_FAQ } from "@/components/landing/faq";
import { HeroDemo } from "@/components/landing/hero-demo";
import { MobileBanner } from "@/components/mobile/mobile-banner";
import { buttonVariants } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

export function LandingContent() {
    const { user, loading } = useAuthUser();
    const isSignedIn = !loading && user !== null;

    const primaryHref = isSignedIn ? "/app" : "/install";
    const primaryLabel = isSignedIn ? "Open Sayzo" : "Install Sayzo";
    const secondaryHref = isSignedIn ? "/install" : "/app";
    const secondaryLabel = isSignedIn
        ? "Install the companion"
        : "Open the web app";

    const cta = (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
                href={primaryHref}
                className={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "bg-blue-600 px-5 text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25 [a]:hover:bg-blue-700",
                )}
            >
                {primaryLabel}
                <ArrowRight />
            </Link>
            <Link
                href={secondaryHref}
                className={cn(
                    buttonVariants({ variant: "ghost", size: "lg" }),
                    "text-muted-foreground",
                )}
            >
                {secondaryLabel}
            </Link>
        </div>
    );

    return (
        <main className="min-h-screen bg-background">
            <MobileBanner page="landing" />
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
                        href="/install"
                        className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "hidden text-muted-foreground sm:inline-flex",
                        )}
                    >
                        Install
                    </Link>
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
                        {isSignedIn ? "Open app" : "Sign in"}
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <section className="relative isolate overflow-hidden">
                {/* Background atmosphere — restrained, not a wash. A faint sky
                    dot-grid that masks out toward the edges for texture/depth,
                    plus a single soft glow behind the demo so the card lifts
                    off the page. The demo itself carries the blue. */}
                <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle,rgba(2,132,199,0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(60%_55%_at_50%_0%,black,transparent)]" />
                <div className="pointer-events-none absolute left-1/2 top-[44%] -z-10 h-72 w-[42rem] max-w-[88vw] -translate-x-1/2 rounded-[50%] bg-sky-300/20 blur-[110px] dark:bg-sky-500/10" />

                <div className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-4xl flex-col items-center justify-center px-6 py-8 text-center">
                    <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                        Do your best work in English.
                    </h1>
                    <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                        Sayzo sits in on the work calls you choose, tells you
                        how your English landed, and lets you replay the moments
                        that didn&rsquo;t.
                    </p>

                    <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                        <Link
                            href={primaryHref}
                            className={cn(
                                buttonVariants({
                                    variant: "default",
                                    size: "lg",
                                }),
                                "bg-blue-600 px-5 text-white shadow-sm shadow-blue-600/20 transition-all hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25 [a]:hover:bg-blue-700",
                            )}
                        >
                            {primaryLabel}
                            <ArrowRight />
                        </Link>
                        <Link
                            href={secondaryHref}
                            className={cn(
                                buttonVariants({
                                    variant: "ghost",
                                    size: "lg",
                                }),
                                "text-muted-foreground",
                            )}
                        >
                            {secondaryLabel}
                        </Link>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Free to start. No credit card. Starting with remote
                        professionals in the Philippines.
                    </p>

                    {/* The demo — the animated call → web app loop */}
                    <div className="mt-8 w-full">
                        <HeroDemo />
                    </div>
                </div>
            </section>

            {/* The loop */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
                        How it works
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                        Coaching from the conversations you actually have.
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        No flashcards. No scripted lessons. No made-up
                        scenarios. Sayzo coaches you on the real conversations
                        you already have at work, then lets you replay the
                        moments that matter.
                    </p>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-3">
                    <StepCard
                        step="01"
                        icon={<Wand2 className="size-5" />}
                        title="Add Sayzo to your work calls"
                        body="A quick one-time setup. Sayzo works best on desktop, where it can sit in on the calls you choose."
                    />
                    <StepCard
                        step="02"
                        icon={<Sparkles className="size-5" />}
                        title="Get feedback after every conversation"
                        body="Sayzo writes up how it went: where your point landed, where it slipped, and the one thing worth fixing first."
                    />
                    <StepCard
                        step="03"
                        icon={<Mic className="size-5" />}
                        title="Replay the moments that matter"
                        body="Turn any conversation into a quick replay. Say it again, better, and hear the difference before your next call."
                    />
                </div>
            </section>

            {/* What Sayzo coaches you on */}
            <section className="border-y border-border/70 bg-muted/30">
                <div className="mx-auto w-full max-w-5xl px-6 py-20">
                    <div className="mx-auto max-w-2xl text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
                            What it coaches
                        </p>
                        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                            What Sayzo coaches you on.
                        </h2>
                        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                            Sayzo recognizes these moments in your real
                            conversations and helps you say them better:
                            coaching, a cleaner way to say what you meant, and
                            one takeaway worth bringing into your next call.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <CoachingCard
                            icon={<Sparkles className="size-4" />}
                            title="Standups & status updates"
                            body="The update that actually lands. Clarity and structure so your work gets seen, in standups, all-hands, and the Slack thread your manager reads."
                        />
                        <CoachingCard
                            icon={<Waves className="size-4" />}
                            title="Client calls & demos"
                            body="Lead the conversation instead of reacting to it. Openers, pivots, and pushback that keep you driving the call."
                        />
                        <CoachingCard
                            icon={<Gauge className="size-4" />}
                            title="Interviews & promotions"
                            body="Answers with a spine. Tell the stories about your work so they remember the experience, not the hesitation."
                        />
                        <CoachingCard
                            icon={<Mic className="size-4" />}
                            title="1:1s & hard conversations"
                            body="Say what you actually think to your manager. Words for disagreement, pushback, and asking for what you want."
                        />
                    </div>
                    <div className="mt-10 flex flex-col items-center gap-3 text-center">
                        <p className="max-w-xl text-sm text-muted-foreground">
                            Sayzo is the English speaking coach for non-native
                            professionals on global teams: coaching grounded in
                            your real conversations and the patterns it notices
                            over time, from standups to stakeholder pitches to
                            interviews for the next step in your career.
                        </p>
                    </div>
                </div>
            </section>

            {/* Privacy strip */}
            <section className="mx-auto w-full max-w-5xl px-6 py-20">
                <div className="grid items-start gap-6 rounded-2xl border border-border/70 bg-card p-8 shadow-sm sm:grid-cols-[auto_1fr] sm:gap-10">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        <Shield className="size-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold tracking-tight">
                            Private by design.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            Sayzo only works with the conversations you choose.
                            You can review anything before you replay it, delete
                            any conversation at any time, and sign out to stop
                            contributing new data in seconds.
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
                            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
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
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">
                        Why Sayzo
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                        Not another phrase app.
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        Generic English tools teach the language in a vacuum.
                        Sayzo coaches you inside the job you already have, and
                        the one you&apos;re working toward.
                    </p>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-3">
                    <CompareCard
                        versus="vs. meeting notetakers"
                        title="Coaching, not archiving"
                        body="Granola and Otter hand you a transcript of what happened. Sayzo hands you what to say better next time, and lets you replay the exact moments your point did not land."
                    />
                    <CompareCard
                        versus="vs. gamified apps"
                        title="Standups, not streaks"
                        body="Owl combos and flashcard decks won't prepare you for a status update or a stakeholder call. Sayzo coaches the real conversations your career runs on."
                    />
                    <CompareCard
                        versus="vs. hiring a tutor"
                        title="A fraction of the cost"
                        body="A tutor is one hour a week at $50 to $100, built around a generic syllabus. Sayzo fits between your calls, coaches the exact rooms your career turns on, and costs less than a single session."
                    />
                </div>
            </section>

            {/* FAQ */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        Questions you&apos;re probably asking.
                    </h2>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-2">
                    {LANDING_FAQ.map((item) => (
                        <FaqItem
                            key={item.question}
                            question={item.question}
                            answer={item.answer}
                        />
                    ))}
                </div>
            </section>

            {/* Final CTA */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="relative isolate overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 via-background to-indigo-50/50 px-6 py-16 text-center shadow-sm ring-1 ring-black/5 dark:border-sky-900/40 dark:from-sky-950/30 dark:via-background dark:to-indigo-950/20">
                    <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle,rgba(2,132,199,0.06)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
                    <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                        Get coaching from your next conversation.
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                        Install Sayzo today. In a few weeks, hear the difference
                        in your next standup, your next demo, your next
                        interview.
                    </p>
                    <div className="mt-8 flex flex-col items-center gap-3">
                        {cta}
                        <p className="text-xs text-muted-foreground">
                            Free to start. No credit card.
                        </p>
                    </div>
                </div>
            </section>

            <footer className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 border-t border-border/70 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
                <span>© {new Date().getFullYear()} Sayzo</span>
                <div className="flex items-center gap-5">
                    <Link
                        href="/install"
                        className="transition-colors hover:text-foreground"
                    >
                        Install
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
        <div className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:shadow-md dark:hover:border-sky-800/60">
            <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 transition-colors group-hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-300">
                    {icon}
                </div>
                <span className="font-mono text-xs tracking-widest text-sky-600/70 dark:text-sky-400/60">
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

function CoachingCard({
    icon,
    title,
    body,
}: {
    icon: React.ReactNode;
    title: string;
    body: string;
}) {
    return (
        <div className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:shadow-md dark:hover:border-sky-800/60">
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 transition-colors group-hover:bg-sky-200 dark:bg-sky-500/15 dark:text-sky-300">
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

function FaqItem({ question, answer }: { question: string; answer: string }) {
    return (
        <div className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:shadow-md dark:hover:border-sky-800/60">
            <h3 className="text-sm font-semibold tracking-tight">{question}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {answer}
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
        <div className="group rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200/80 hover:shadow-md dark:hover:border-sky-800/60">
            <p className="text-xs font-medium uppercase tracking-widest text-sky-600/90 dark:text-sky-400/80">
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
