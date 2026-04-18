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
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

export default function LandingPage() {
    const { user, loading } = useAuthUser();
    const isSignedIn = !loading && user !== null;

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
                <div className="mb-4 inline-flex items-center rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                    In early access · Launched March 2026
                </div>
                <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Coaching from your real meetings — not textbook scenarios.
                </p>
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Do your best work
                    <br />
                    in English.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    For non-native English speakers at US, EU, and global
                    companies. Sayzo learns from your real work meetings —
                    the standup where you stayed quiet, the client call
                    where your point didn&apos;t land, the interview you
                    over-rehearsed — then drills the exact moments that
                    cost you, before the next one.
                </p>
                <p className="mt-4 max-w-xl text-sm text-muted-foreground/80">
                    Starting with remote professionals in the Philippines — engineers, VAs, ops, designers, and anyone on a global team.
                </p>
                <p className="mt-3 text-sm italic text-muted-foreground/70">
                    Kaya mo &apos;yan — in English, too.
                </p>
                <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
                    <Link
                        href="/app"
                        className={cn(
                            buttonVariants({ variant: "default", size: "lg" }),
                            "px-5",
                        )}
                    >
                        {isSignedIn ? "Open Sayzo" : "Try your first drill"}
                        <ArrowRight />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        10 drills free. No credit card.
                    </p>
                </div>
            </section>

            {/* The loop */}
            <section className="mx-auto w-full max-w-5xl px-6 pb-24">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        A coach that hears what your manager hears.
                    </h2>
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                        Generic English apps hand you textbook scenarios.
                        Sayzo starts from your real work meetings — and
                        coaches you on the exact spots where your point
                        doesn&apos;t land, before the next one.
                    </p>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-3">
                    <StepCard
                        step="01"
                        icon={<Ear className="size-5" />}
                        title="Start in the browser"
                        body="Sign in with Google and run your first drill. No install, no setup — just a prompt, a mic, and coaching that shows you what a real session feels like."
                    />
                    <StepCard
                        step="02"
                        icon={<Wand2 className="size-5" />}
                        title="Bring Sayzo to your real meetings"
                        body="Install the desktop companion and Sayzo sits in on your real work meetings — standups, client calls, 1:1s — picking up the spots where you hesitate and the moments your point gets lost."
                    />
                    <StepCard
                        step="03"
                        icon={<Mic className="size-5" />}
                        title="Drills built from your week"
                        body="Each new drill is tuned to what Sayzo heard in your actual meetings — not a generic curriculum. Practice the exact moments that cost you, before walking into the next one."
                    />
                </div>
            </section>

            {/* Drills preview */}
            <section className="border-y border-border/70 bg-muted/30">
                <div className="mx-auto w-full max-w-5xl px-6 py-20">
                    <div className="mx-auto max-w-2xl text-center">
                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                            Drills tuned to the rooms your career happens in.
                        </h2>
                        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                            Each drill is a short workplace scenario, a
                            prompt, and a mic. Speak a response, and Sayzo
                            comes back with coaching, a cleaner way to say
                            what you meant, and one takeaway worth bringing
                            into your next meeting.
                        </p>
                    </div>
                    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <DrillCard
                            icon={<Sparkles className="size-4" />}
                            title="Standups & status updates"
                            body="The update that actually lands. Clarity and structure so your work gets seen — in standups, all-hands, and the Slack thread your manager reads."
                        />
                        <DrillCard
                            icon={<Waves className="size-4" />}
                            title="Client calls & demos"
                            body="Lead the conversation instead of reacting to it. Openers, pivots, and pushback that keep you driving the call."
                        />
                        <DrillCard
                            icon={<Gauge className="size-4" />}
                            title="Interviews & promotions"
                            body="Answers with a spine. Tell the stories about your work so they remember the experience — not the hesitation."
                        />
                        <DrillCard
                            icon={<Mic className="size-4" />}
                            title="1:1s & hard conversations"
                            body="Say what you actually think to your manager. Words for disagreement, pushback, and asking for what you want."
                        />
                    </div>
                    <div className="mt-10 flex flex-col items-center gap-3 text-center">
                        <p className="max-w-xl text-sm text-muted-foreground">
                            Every drill is generated for your role, your
                            goals, and the patterns Sayzo notices in your
                            actual meetings — from standups to stakeholder
                            pitches to interviews for the next step in your
                            career.
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
                        Generic English tools teach the language in a
                        vacuum. Sayzo coaches you inside the job you
                        already have — and the one you&apos;re working toward.
                    </p>
                </div>
                <div className="mt-12 grid gap-4 sm:grid-cols-3">
                    <CompareCard
                        versus="vs. meeting notetakers"
                        title="Coaching, not archiving"
                        body="Granola and Otter hand you a transcript of what happened. Sayzo hands you what to say better next time — drills tuned to the exact moments your point didn&apos;t land."
                    />
                    <CompareCard
                        versus="vs. gamified apps"
                        title="Standups, not streaks"
                        body="Owl combos and flashcard decks won&apos;t prepare you for a status update or a stakeholder call. Sayzo drills the rooms you&apos;ll actually be in this week."
                    />
                    <CompareCard
                        versus="vs. hiring a tutor"
                        title="A fraction of the cost"
                        body="A tutor is one hour a week at $50–100, built around a generic syllabus. Sayzo fits between meetings, drills the exact rooms your career turns on, and costs less than a single session."
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
                    <FaqItem
                        question="Is it free?"
                        answer="Your first 10 drills are on us — no credit card. When you're ready for more, request full access and keep going."
                    />
                    <FaqItem
                        question="How does a drill work?"
                        answer="One workplace scenario, one prompt, one mic. Speak your response and Sayzo comes back with coaching, a cleaner version of what you meant, and one takeaway worth bringing to your next meeting."
                    />
                    <FaqItem
                        question="Do I need to install anything?"
                        answer="Drills run in your browser, so you can try Sayzo before installing anything. The desktop companion is what brings your real meetings into your coaching — that's where Sayzo stops being a practice app and becomes a coach that knows your actual work."
                    />
                    <FaqItem
                        question="Is my audio private?"
                        answer="Sayzo only works with what's worth coaching on. You can review anything before it becomes a drill, delete any recording, and sign out to stop contributing new data."
                    />
                    <FaqItem
                        question="How is this different from hiring a tutor?"
                        answer="A tutor is $50–100 an hour, once a week, built around a generic syllabus. Sayzo fits between meetings, drills the exact rooms your career runs on, and costs less than a single session. It also remembers your patterns between drills — tutors start from zero every week."
                    />
                    <FaqItem
                        question="What if my English is already pretty good?"
                        answer="Sayzo tunes to your level. It won't drill you on basics if your friction is elsewhere — in structure, pace, or the moment you need to push back on a stakeholder without sounding rude."
                    />
                </div>
            </section>

            {/* Final CTA */}
            <section className="mx-auto w-full max-w-3xl px-6 pb-24 text-center">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Excel at work — in English.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                    Start with your first drill today. In thirty days, hear
                    the difference — in your next standup, your next demo,
                    your next interview.
                </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                    <Link
                        href="/app"
                        className={cn(
                            buttonVariants({ variant: "default", size: "lg" }),
                            "px-5",
                        )}
                    >
                        {isSignedIn ? "Open Sayzo" : "Try your first drill"}
                        <ArrowRight />
                    </Link>
                    <p className="text-xs text-muted-foreground">
                        10 drills free. No credit card.
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

function FaqItem({
    question,
    answer,
}: {
    question: string;
    answer: string;
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold tracking-tight">
                {question}
            </h3>
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
