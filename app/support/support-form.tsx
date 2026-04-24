"use client";

import {
    Bug,
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    HelpCircle,
    Loader2,
    Mail,
    MessageCircle,
    Send,
    Sparkles,
    Terminal,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/hooks/use-auth-user";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";
import type { SupportCategory } from "@/types/support";

const SUPPORT_EMAIL = "team@sayzo.app";

const CATEGORY_OPTIONS: ReadonlyArray<{
    id: SupportCategory;
    label: string;
    description: string;
    icon: typeof Bug;
}> = [
    {
        id: "bug",
        label: "Something broke",
        description: "A crash, a hang, a drill that wouldn't load",
        icon: Bug,
    },
    {
        id: "feature",
        label: "I wish Sayzo could…",
        description: "An idea or feature you'd love to see",
        icon: Sparkles,
    },
    {
        id: "question",
        label: "Quick question",
        description: "Not sure how something works",
        icon: HelpCircle,
    },
    {
        id: "other",
        label: "Something else",
        description: "Feedback, praise, anything on your mind",
        icon: MessageCircle,
    },
];

const OS_LABELS: Record<string, string> = {
    darwin: "macOS",
    macos: "macOS",
    mac: "macOS",
    win32: "Windows",
    windows: "Windows",
    linux: "Linux",
};

function prettyOs(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const key = value.toLowerCase();
    return OS_LABELS[key] ?? value;
}

const INPUT_CLASS = cn(
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow]",
    "text-foreground placeholder:text-muted-foreground",
    "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-50",
);

interface Props {
    agentVersion?: string;
    agentOs?: string;
    clientUid?: string;
}

export function SupportForm({ agentVersion, agentOs, clientUid }: Readonly<Props>) {
    const { user } = useAuthUser();

    const [category, setCategory] = useState<SupportCategory>("bug");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [email, setEmail] = useState("");
    const [diagnostics, setDiagnostics] = useState("");
    const [diagnosticsOpen, setDiagnosticsOpen] = useState(
        Boolean(agentVersion || agentOs),
    );
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (user?.email && !email) {
            setEmail(user.email);
        }
    }, [user?.email, email]);

    const fromAgent = Boolean(agentVersion || agentOs);
    const prettyOsValue = prettyOs(agentOs);

    const handleSubmit = async (e?: FormEvent) => {
        e?.preventDefault();
        setError(null);

        const trimmedSubject = subject.trim();
        const trimmedMessage = message.trim();
        const trimmedEmail = email.trim();
        const trimmedDiagnostics = diagnostics.trim();

        if (!trimmedSubject) {
            setError("Give your message a short subject so we know where to look.");
            return;
        }
        if (!trimmedMessage) {
            setError("Tell us a little about what's going on.");
            return;
        }
        if (!trimmedEmail || !/.+@.+\..+/.test(trimmedEmail)) {
            setError("Please add an email so we can write back.");
            return;
        }

        setSubmitting(true);
        try {
            await api
                .post("/api/support-reports", {
                    json: {
                        category,
                        subject: trimmedSubject,
                        message: trimmedMessage,
                        email: trimmedEmail,
                        diagnostics: trimmedDiagnostics || undefined,
                        agentVersion,
                        agentOs,
                        clientUid,
                    },
                    timeout: 20_000,
                })
                .json();
            track("support_submitted", {
                category,
                has_agent_meta: fromAgent,
                signed_in: Boolean(user),
            });
            setSubmitted(true);
        } catch (err) {
            setError(
                await getKyErrorMessage(
                    err,
                    "Couldn't send your message. Please try again, or email us directly at " +
                        SUPPORT_EMAIL +
                        ".",
                ),
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleCopyEmail = async () => {
        try {
            await navigator.clipboard.writeText(SUPPORT_EMAIL);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    if (submitted) {
        return (
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
                <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <Check className="size-5" />
                    </div>
                    <div className="min-w-0 space-y-2">
                        <h2 className="text-xl font-semibold tracking-tight">
                            Got it — thanks for writing in.
                        </h2>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            We&apos;ll reply to{" "}
                            <span className="font-medium text-foreground">
                                {email.trim()}
                            </span>
                            , usually within a day or two. If it&apos;s urgent,
                            you can also email us directly at{" "}
                            <a
                                className="text-foreground underline-offset-2 hover:underline"
                                href={`mailto:${SUPPORT_EMAIL}`}
                            >
                                {SUPPORT_EMAIL}
                            </a>
                            .
                        </p>
                        <div className="flex flex-wrap items-center gap-3 pt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSubmitted(false);
                                    setSubject("");
                                    setMessage("");
                                    setDiagnostics("");
                                    setError(null);
                                }}
                            >
                                Send another
                            </Button>
                            <Link
                                href="/"
                                className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                                Back to home
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email fallback row */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                    <Mail className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                        Prefer email?
                    </span>
                    <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                        {SUPPORT_EMAIL}
                    </a>
                </div>
                <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                    {copied ? (
                        <>
                            <Check className="size-3" />
                            Copied
                        </>
                    ) : (
                        <>
                            <Copy className="size-3" />
                            Copy
                        </>
                    )}
                </button>
            </div>

            {/* Agent metadata chip */}
            {fromAgent ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 font-medium text-sky-700 dark:text-sky-300">
                        <Terminal className="size-3" />
                        From the Sayzo desktop app
                        {agentVersion ? (
                            <span className="text-sky-700/80 dark:text-sky-300/80">
                                v{agentVersion}
                            </span>
                        ) : null}
                        {prettyOsValue ? (
                            <span className="text-sky-700/80 dark:text-sky-300/80">
                                · {prettyOsValue}
                            </span>
                        ) : null}
                    </span>
                    <span className="text-muted-foreground">
                        We&apos;ll include this with your message.
                    </span>
                </div>
            ) : null}

            {/* Category */}
            <div className="space-y-3">
                <Label>What&apos;s this about?</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {CATEGORY_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = category === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => setCategory(option.id)}
                                aria-pressed={active}
                                className={cn(
                                    "group flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                    active
                                        ? "border-sky-500/60 bg-sky-500/[0.06] shadow-sm dark:border-sky-400/50 dark:bg-sky-400/[0.08]"
                                        : "border-border/70 bg-background hover:border-border hover:bg-muted/40",
                                )}
                            >
                                <div
                                    className={cn(
                                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                                        active
                                            ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
                                            : "bg-muted text-muted-foreground group-hover:text-foreground",
                                    )}
                                >
                                    <Icon className="size-4" />
                                </div>
                                <div className="min-w-0">
                                    <div
                                        className={cn(
                                            "text-sm font-medium",
                                            active
                                                ? "text-foreground"
                                                : "text-foreground/90",
                                        )}
                                    >
                                        {option.label}
                                    </div>
                                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                                        {option.description}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
                <Label htmlFor="support-subject">Subject</Label>
                <input
                    id="support-subject"
                    type="text"
                    maxLength={200}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="A short summary — e.g. 'Drill won't start on macOS'"
                    disabled={submitting}
                    className={INPUT_CLASS}
                />
            </div>

            {/* Message */}
            <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                    <Label htmlFor="support-message">Tell us more</Label>
                    <span
                        className={cn(
                            "text-xs",
                            message.length > 4500
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground/70",
                        )}
                    >
                        {message.length.toLocaleString()} / 5,000
                    </span>
                </div>
                <Textarea
                    id="support-message"
                    rows={6}
                    maxLength={5000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What happened? What did you expect? Anything you tried? The more detail the better — screenshots are welcome as links."
                    disabled={submitting}
                />
            </div>

            {/* Diagnostics (collapsible) */}
            <div className="rounded-xl border border-border/70 bg-muted/20">
                <button
                    type="button"
                    onClick={() => setDiagnosticsOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    aria-expanded={diagnosticsOpen}
                >
                    <div className="flex items-center gap-2">
                        <Terminal className="size-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                            Include diagnostic info
                        </span>
                        <span className="text-xs text-muted-foreground">
                            (optional, but really helpful)
                        </span>
                    </div>
                    {diagnosticsOpen ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                </button>
                {diagnosticsOpen ? (
                    <div className="space-y-2 border-t border-border/60 px-4 py-3">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                            In the Sayzo desktop app, use{" "}
                            <span className="font-medium text-foreground">
                                Copy diagnostic
                            </span>{" "}
                            to grab a snapshot of your setup, then paste it
                            below. It&apos;s technical info about the app
                            version, audio devices, and recent errors — no
                            transcripts or recordings.
                        </p>
                        <Textarea
                            rows={6}
                            maxLength={100000}
                            value={diagnostics}
                            onChange={(e) => setDiagnostics(e.target.value)}
                            placeholder="Paste the diagnostic text here…"
                            disabled={submitting}
                            className="font-mono text-xs"
                        />
                        {diagnostics.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground/70">
                                {diagnostics.length.toLocaleString()} characters
                                pasted
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* Email */}
            <div className="space-y-2">
                <Label htmlFor="support-email">Your email</Label>
                <input
                    id="support-email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={submitting}
                    className={INPUT_CLASS}
                />
                <p className="text-xs text-muted-foreground">
                    {user
                        ? "Prefilled from your Sayzo account. Change it if you'd rather hear back somewhere else."
                        : "So we can write back. We won't send anything else."}
                </p>
            </div>

            {/* Error */}
            {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                    {error}
                </div>
            ) : null}

            {/* Submit */}
            <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-muted-foreground">
                    A real person reads every message.
                </p>
                <Button type="submit" disabled={submitting} size="lg">
                    {submitting ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            Sending…
                        </>
                    ) : (
                        <>
                            <Send className="size-4" />
                            Send message
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}
