"use client";

import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";

import { CapturesEmptyState } from "@/components/app/captures-empty-state";
import { CapturesList } from "@/components/app/captures-list";
import { Eyebrow } from "@/components/app/eyebrow";
import { HeroPanel } from "@/components/app/hero-panel";
import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { CoachingInsightCard } from "@/components/conversations/coaching-insight-card";
import { MeetingSummaryHero } from "@/components/conversations/meeting-summary-view";
import { StaggerItem } from "@/components/coaching/briefing";
import { buttonVariants } from "@/components/ui/button";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return dateStr;
    }
}

/**
 * The /app landing — a calm overview, NOT a list (the list lives in the rail on
 * desktop). Greeting → a single featured "latest conversation" hero → a small
 * Focus nudge. On mobile (no rail) it also renders the full conversation list.
 */
export function OverviewView() {
    const { user } = useAuthUser();
    const { captures, loading } = useAllCaptures(user?.uid);

    const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? "";
    const latest = captures[0];
    const summary = latest
        ? (latest.serverSummary ?? latest.summary ?? "")
        : "";
    const coachingInsight =
        latest && latest.status === "analyzed"
            ? (latest.analysis?.coachingInsight ?? null)
            : null;

    return (
        <div className="space-y-6">
            <StaggerItem order={0}>
                <Eyebrow>Overview</Eyebrow>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Welcome back{firstName ? `, ${firstName}` : ""}
                </h1>
            </StaggerItem>

            {loading && captures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Loading your conversations…
                </p>
            ) : captures.length === 0 ? (
                <StaggerItem order={1}>
                    <CapturesEmptyState />
                </StaggerItem>
            ) : (
                <>
                    {/* Featured latest conversation — the whole header is a
                        click target into the conversation (see the stretched
                        overlay link below). */}
                    <StaggerItem order={1}>
                        <HeroPanel className="group relative">
                            {/* Stretched overlay — makes the entire panel
                                clickable. aria-hidden + tabIndex=-1 because the
                                visible "Open conversation" button is the real,
                                keyboard-focusable link; this is a mouse
                                convenience only. It sits ABOVE the static header
                                content (z-0 over in-flow) but BELOW the meeting
                                notes block (raised to z-10) so the notes toggle,
                                checkboxes and copy button still work. */}
                            <Link
                                href={`/app/conversations/${latest.id}`}
                                aria-hidden
                                tabIndex={-1}
                                className="absolute inset-0 z-0"
                            />
                            <Eyebrow>Latest conversation</Eyebrow>
                            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-lg font-semibold tracking-tight underline-offset-4 transition-colors group-hover:underline">
                                        {latest.serverTitle ?? latest.title}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {formatDate(latest.startedAt)}
                                    </p>
                                    <div className="mt-3">
                                        <CaptureStatusBadge
                                            status={latest.status}
                                            rejectionReason={
                                                latest.rejectionReason
                                            }
                                            error={latest.error}
                                        />
                                    </div>
                                </div>
                                <Link
                                    href={`/app/conversations/${latest.id}`}
                                    className={cn(
                                        buttonVariants({ size: "sm" }),
                                        "relative z-10 shrink-0",
                                    )}
                                >
                                    <ArrowRight className="size-4" />
                                    Open conversation
                                </Link>
                            </div>

                            {/* Meeting notes — TL;DR + the collapsible
                                document-edge, reused from the conversation page
                                so the notes read identically. Falls back to the
                                plain server summary for legacy captures. */}
                            {latest.id && latest.meetingSummary ? (
                                <div className="relative z-10 mt-4">
                                    <MeetingSummaryHero
                                        captureId={latest.id}
                                        summary={latest.meetingSummary}
                                    />
                                </div>
                            ) : summary ? (
                                <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-foreground/80">
                                    {summary}
                                </p>
                            ) : null}

                            {/* Top coaching takeaway — the bare cardless variant
                                (the header is no longer a gradient panel, so a
                                white sub-card would read as a stray box). */}
                            {coachingInsight ? (
                                <div className="mt-4">
                                    <CoachingInsightCard
                                        insight={coachingInsight}
                                        variant="hero"
                                    />
                                </div>
                            ) : null}
                        </HeroPanel>
                    </StaggerItem>

                    {/* Focus nudge — a quiet cardless hover row, not a second
                        hero. */}
                    <StaggerItem order={2}>
                        <Link
                            href="/app/focus"
                            className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-sky-50/30"
                        >
                            <div className="flex items-start gap-3">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-200/60 text-sky-700">
                                    <Target className="size-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">
                                        Your Focus
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Where to put your attention, built from
                                        every conversation and replay so far.
                                    </p>
                                </div>
                            </div>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </StaggerItem>

                    {/* Mobile only — the rail is hidden, so surface the full
                        list here so phone users can reach every conversation. */}
                    <StaggerItem order={3} className="space-y-3 md:hidden">
                        <Eyebrow tone="muted">All conversations</Eyebrow>
                        <CapturesList captures={captures} />
                    </StaggerItem>
                </>
            )}
        </div>
    );
}
