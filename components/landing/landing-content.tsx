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
                    "px-5",
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
            <section className="mx-auto flex min-h-[calc(100svh-5rem)] w-full max-w-3xl flex-col items-center justify-center px-6 pb-12 text-center">
                <Image
                    src="/sayzo-logo.png"
                    alt="Sayzo logo"
                    width={120}
                    height={120}
                    priority
                    className="mb-6"
                />
                <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Coaching from your real conversations, not scripted
                    practice.
                </p>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Do your best work
                    <br />
                    in English.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    For non-native English speakers at US, EU, and global
                    companies. Sayzo learns from the way you actually speak at
                    work: the standup where you went quiet, the client call
                    where your point did not land, the interview you
                    over-rehearsed. After each conversation it shows you what to
                    say better next time, and lets you replay the moment until
                    it feels natural.
                </p>
                <p className="mt-4 max-w-xl text-sm text-muted-foreground/80">
                    Starting with remote professionals in the Philippines:
                    engineers, VAs, ops, designers, and anyone on a global team.
                </p>
                <div className="mt-10 flex flex-col items-center gap-3">
                    {cta}
                    <p className="text-xs text-muted-foreground">
                        Free to start. No credit card.
                    </p>
                </div>
            </section>

            {/* The loop */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
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
                            Coaching is grounded in your real conversations and
                            the patterns Sayzo notices over time, from standups
                            to stakeholder pitches to interviews for the next
                            step in your career.
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
            <section className="mx-auto w-full max-w-3xl px-6 pb-24 text-center">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Get coaching from your next conversation.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                    Install Sayzo today. In a few weeks, hear the difference in
                    your next standup, your next demo, your next interview.
                </p>
                <div className="mt-8 flex flex-col items-center gap-3">
                    {cta}
                    <p className="text-xs text-muted-foreground">
                        Free to start. No credit card.
                    </p>
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

function FaqItem({
    question,
    answer,
}: {
    question: string;
    answer: string;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
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
