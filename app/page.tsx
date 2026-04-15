"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mic, Repeat, TrendingUp } from "lucide-react";

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
                        sayzo
                    </span>
                </div>
                <Link
                    href="/app"
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                    Sign in
                </Link>
            </header>

            <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pt-16 pb-20 text-center">
                <Image
                    src="/sayzo-logo.png"
                    alt="Sayzo logo"
                    width={120}
                    height={120}
                    priority
                    className="mb-8"
                />
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                    Speak English fluently,
                    <br />
                    in the rooms that matter.
                </h1>
                <p className="mt-6 max-w-xl text-base text-muted-foreground leading-relaxed sm:text-lg">
                    Sayzo is a daily practice platform for professional English —
                    product demos, extemporaneous talks, and workplace
                    conversations. Not gamified phrase drills. About thirty
                    minutes a day, meaningful progress in thirty to sixty.
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

            <section className="mx-auto w-full max-w-5xl px-6 pb-20">
                <div className="grid gap-4 sm:grid-cols-3">
                    <FeatureCard
                        icon={<Mic className="size-5" />}
                        title="Real drills, real speech"
                        body="Practice the conversations you actually have — not flashcards. Sayzo listens and responds."
                    />
                    <FeatureCard
                        icon={<Repeat className="size-5" />}
                        title="A daily rhythm"
                        body="Thirty focused minutes a day. Sayzo plans each session around your goals and recent performance."
                    />
                    <FeatureCard
                        icon={<TrendingUp className="size-5" />}
                        title="Measurable progress"
                        body="Every session tracks fluency, clarity, and tone. Thirty to sixty days in, you can hear the difference."
                    />
                </div>
            </section>

            <footer className="mx-auto flex w-full max-w-5xl items-center justify-between border-t border-border/70 px-6 py-6 text-xs text-muted-foreground">
                <span>© {new Date().getFullYear()} Sayzo</span>
                <Link href="/app" className="hover:text-foreground">
                    Open app →
                </Link>
            </footer>
        </main>
    );
}

function FeatureCard({
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
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                {icon}
            </div>
            <h3 className="mt-4 text-sm font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                {body}
            </p>
        </div>
    );
}
