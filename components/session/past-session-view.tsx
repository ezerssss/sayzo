"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMemo, useRef } from "react";

import { AudioPlayer } from "@/components/session/audio-player";
import { SessionFeedbackSection } from "@/components/session/session-home/session-feedback-section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionFeedbackType, SessionType } from "@/types/sessions";

type Props = {
    session: SessionType;
    uid: string;
};

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return dateStr;
    }
}

export function PastSessionView(props: Readonly<Props>) {
    const { session, uid } = props;
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const currentTranscript = useMemo(() => {
        return session.transcript?.trim() ?? "";
    }, [session.transcript]);

    const currentFeedback = useMemo<SessionFeedbackType | null>(() => {
        return session.feedback ?? null;
    }, [session.feedback]);

    const hasMainOverview = Boolean(currentFeedback?.overview?.trim());

    const coachingSectionKeys = useMemo<Array<keyof SessionFeedbackType>>(() => {
        if (!currentFeedback) return [];
        const keys: Array<keyof SessionFeedbackType> = [
            "momentsToTighten",
            "structureAndFlow",
            "clarityAndConciseness",
            "relevanceAndFocus",
            "engagement",
            "professionalism",
            "deliveryAndProsody",
        ];
        return keys.filter((key) => {
            const value = currentFeedback[key];
            return typeof value === "string" && value.trim().length > 0;
        });
    }, [currentFeedback]);

    const isSkipped = session.completionStatus === "skipped";
    const hasResults = Boolean(
        session.completionStatus !== "pending" &&
            (isSkipped || session.transcript?.trim() || currentFeedback),
    );
    const requiresRetry = session.completionStatus === "needs_retry";
    const playbackSrc = session.audioUrl ?? null;

    const seekToSecond = (seconds: number) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(seconds)) return;
        el.currentTime = Math.max(0, seconds);
        void el.play();
    };

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
                <Link
                    href="/app"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                    <ArrowLeft className="h-4 w-4" />
                    All drills
                </Link>
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {formatDate(session.createdAt)}
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                    {session.plan.scenario.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {session.plan.skillTarget}
                </p>
            </div>

            {playbackSrc ? (
                <AudioPlayer
                    src={playbackSrc}
                    audioRef={audioRef}
                    className="mt-4"
                />
            ) : null}

            <SessionFeedbackSection
                shouldShowResults={hasResults}
                isSkipped={isSkipped}
                currentTranscript={currentTranscript}
                currentFeedback={currentFeedback}
                hasMainOverview={hasMainOverview}
                coachingSectionKeys={coachingSectionKeys}
                requiresRetry={requiresRetry}
                completionReason={session.completionReason ?? null}
                onSeekToSecond={seekToSecond}
                sessionId={session.id}
                uid={uid}
            />

            {!hasResults && !isSkipped ? (
                <div className="mt-6 rounded-xl border border-dashed border-border/70 p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        This session hasn&apos;t been completed yet.
                    </p>
                </div>
            ) : null}
        </section>
    );
}
