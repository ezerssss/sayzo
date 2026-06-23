"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { FeedbackTabs } from "@/components/coaching/feedback-tabs";
import { ReactionBar } from "@/components/coaching/reaction-bar";
import { AnalysisView } from "@/components/conversations/analysis-view";
import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { Kicker, StaggerItem } from "@/components/coaching/briefing";
import { CoachingInsightCard } from "@/components/conversations/coaching-insight-card";
import { MeetingSummaryHero } from "@/components/conversations/meeting-summary-view";
import { TranscriptView } from "@/components/conversations/transcript-view";
import { PageTour } from "@/components/tour/page-tour";
import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { AudioPlayer } from "@/components/session/audio-player";
import { Eyebrow } from "@/components/app/eyebrow";
import { HeroPanel } from "@/components/app/hero-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useCapture } from "@/hooks/use-capture";
import { usePracticeSessionForCapture } from "@/hooks/use-practice-session-for-capture";
import { track } from "@/lib/analytics/client";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { getKyErrorMessage, isKyHttpStatus } from "@/lib/ky-error-message";
import type { CaptureStatus, CaptureType } from "@/schemas";

type Props = {
    captureId: string;
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

function formatDuration(seconds: number | undefined): string {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
}

function countSpeakers(
    transcript: NonNullable<CaptureType["serverTranscript"]>,
): number {
    const speakers = new Set(transcript.map((l) => l.speaker));
    return speakers.size;
}

function friendlyStatus(status: CaptureStatus): string {
    switch (status) {
        case "queued":
            return "Waiting in queue";
        case "transcribing":
            return "Transcribing audio";
        case "transcribed":
            return "Transcription complete, validating next";
        case "validating":
            return "Checking conversation relevance";
        case "validated":
            return "Validated, starting deep analysis";
        case "analyzing":
            return "Running deep analysis";
        case "profiling":
            return "Updating your profile from this conversation";
        case "analyzed":
            return "Analysis complete";
        case "rejected":
            return "Filtered out — not a relevant conversation";
        case "transcribe_failed":
            return "Transcription encountered an issue, retrying";
        case "validate_failed":
            return "Validation encountered an issue, retrying";
        case "analyze_failed":
            return "Analysis encountered an issue, retrying";
        case "profile_failed":
            return "Profile update encountered an issue, retrying";
        default:
            return "Processing";
    }
}

export function ConversationDetailView(props: Readonly<Props>) {
    const { captureId, uid } = props;
    const router = useRouter();
    const creditGate = useCreditGate();

    const { capture, loading } = useCapture(captureId);
    const { session: practiceSession } = usePracticeSessionForCapture(
        uid,
        captureId,
    );

    const captureOpenedFiredRef = useRef(false);
    useEffect(() => {
        if (captureOpenedFiredRef.current) return;
        if (!capture) return;
        captureOpenedFiredRef.current = true;
        track("capture_opened", { source: "desktop" });
    }, [capture]);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioLoading, setAudioLoading] = useState(false);
    const [practicing, setPracticing] = useState(false);
    const [practiceError, setPracticeError] = useState<string | null>(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const audioStoragePath = capture?.audioStoragePath;

    useEffect(() => {
        let cancelled = false;
        if (!audioStoragePath) return;

        setAudioLoading(true);
        api.get(`/api/captures/${captureId}/audio-url`, {
            timeout: 15_000,
        })
            .json<{ url: string }>()
            .then((res) => {
                if (!cancelled) setAudioUrl(res.url);
            })
            .catch(() => {
                // Audio not available — silently skip
            })
            .finally(() => {
                if (!cancelled) setAudioLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [captureId, audioStoragePath]);

    const transcript = useMemo(() => {
        if (!capture) return [];
        return capture.serverTranscript ?? [];
    }, [capture]);

    if (loading && !capture) {
        return (
            <p className="text-sm text-muted-foreground">
                Loading conversation…
            </p>
        );
    }

    if (!capture) {
        return (
            <p className="text-sm text-destructive" role="alert">
                Conversation not found.
            </p>
        );
    }

    const title = capture.serverTitle ?? capture.title;
    const summary = capture.serverSummary ?? capture.summary;
    const duration = formatDuration(capture.durationSecs);
    const speakerCount = countSpeakers(transcript);
    const analysis = capture.analysis;
    const corrections = capture.transcriptCorrections ?? [];
    const isAnalyzed = capture.status === "analyzed" && analysis;
    const coachingInsight = isAnalyzed
        ? (analysis?.coachingInsight ?? null)
        : null;

    const seekToSecond = (seconds: number) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(seconds)) return;
        el.currentTime = Math.max(0, seconds);
        void el.play();
    };

    const handlePractice = async () => {
        if (!creditGate.guard()) {
            track("credit_limit_reached", { feature: "replay" });
            return;
        }
        setPracticing(true);
        setPracticeError(null);
        try {
            const res = await api
                .post(`/api/captures/${captureId}/practice`, {
                    timeout: 60_000,
                })
                .json<{ sessionId: string }>();
            track("scenario_replay_started", {});
            track("credit_consumed", { feature: "replay" });
            router.push(`/app/replays/${res.sessionId}`);
        } catch (err) {
            if (isKyHttpStatus(err, 402)) {
                track("credit_limit_reached", { feature: "replay" });
                creditGate.openLimitDialog();
                return;
            }
            setPracticeError(
                await getKyErrorMessage(
                    err,
                    "Could not create practice session.",
                ),
            );
        } finally {
            setPracticing(false);
        }
    };

    const handleConfirmDelete = async () => {
        setConfirmDeleteOpen(false);
        setDeleting(true);
        try {
            await api.delete(`/api/captures/${captureId}`, {
                timeout: 30_000,
            });
            router.push("/app");
        } catch (err) {
            setPracticeError(
                await getKyErrorMessage(err, "Could not delete capture."),
            );
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {practiceError && (
                <p className="text-sm text-destructive" role="alert">
                    {practiceError}
                </p>
            )}

            {/* Title hero — the one gradient panel on the page (shared
                    HeroPanel), so the conversation detail reads as part of the
                    same polished product. */}
            <HeroPanel>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <Eyebrow tone="sky">
                            Captured
                            <span className="mx-1.5 text-sky-700/50">
                                &middot;
                            </span>
                            <span className="font-normal normal-case text-foreground/80">
                                {formatDate(capture.startedAt)}
                            </span>
                        </Eyebrow>
                        <h2 className="mt-2 text-xl font-semibold tracking-tight">
                            {title}
                        </h2>
                        {/* The meeting summary lives here, where the
                                one-line server summary used to be: TL;DR
                                inline, full notes behind "Read more". Legacy
                                captures without one fall back to the plain
                                summary line. */}
                        {capture.meetingSummary ? (
                            <MeetingSummaryHero
                                captureId={captureId}
                                summary={capture.meetingSummary}
                            />
                        ) : summary ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                                {summary}
                            </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {duration && <span>{duration}</span>}
                            {duration && (
                                <span className="text-muted-foreground/50">
                                    &middot;
                                </span>
                            )}
                            <span>
                                {speakerCount}{" "}
                                {speakerCount === 1 ? "speaker" : "speakers"}
                            </span>
                            <CaptureStatusBadge
                                status={capture.status}
                                rejectionReason={capture.rejectionReason}
                                error={capture.error}
                            />
                        </div>
                    </div>
                    <div className="relative flex shrink-0 flex-wrap items-center gap-2">
                        {capture.status === "analyzed" &&
                            (practiceSession ? (
                                <Link
                                    href={`/app/replays/${practiceSession.id}`}
                                    data-tour="replay-conversation"
                                    className={cn(
                                        buttonVariants({ size: "sm" }),
                                    )}
                                >
                                    <ArrowRight className="h-4 w-4" />
                                    {practiceSession.completionStatus ===
                                    "pending"
                                        ? "Continue your replay"
                                        : "View replay results"}
                                </Link>
                            ) : (
                                <Button
                                    size="sm"
                                    data-tour="replay-conversation"
                                    onClick={() => void handlePractice()}
                                    disabled={practicing}
                                    className={cn(
                                        creditGate.isExhausted && "opacity-60",
                                    )}
                                    title={
                                        creditGate.isExhausted
                                            ? "You're out of Sayzo credits"
                                            : "Redo this conversation yourself and get coached on your new take"
                                    }
                                >
                                    {practicing ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : creditGate.isExhausted ? (
                                        <Lock className="h-4 w-4" />
                                    ) : (
                                        <Play className="h-4 w-4" />
                                    )}
                                    Replay this conversation
                                </Button>
                            ))}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDeleteOpen(true)}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
            </HeroPanel>

            {/* One-sided capture: set expectations softly before the feedback —
                we only heard the user, so the coaching is about their delivery,
                not a back-and-forth. Tonal left-accent, no box (briefing-sheet). */}
            {isAnalyzed && capture.isOneSided ? (
                <p className="border-l-2 border-border/60 pl-3 text-sm leading-relaxed text-muted-foreground">
                    We only heard your side this time — so this is feedback on
                    how you came across, not the back-and-forth.
                </p>
            ) : null}

            {/* Top coaching takeaway — the one thing most worth the
                    user's attention, mirrored from the desktop agent's card.
                    Sits above the audio + tabs so the "See full feedback"
                    deep-link lands directly on it. */}
            {coachingInsight ? (
                <CoachingInsightCard insight={coachingInsight} />
            ) : null}

            {/* Audio player */}
            {audioLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading audio...
                </div>
            ) : audioUrl ? (
                <AudioPlayer src={audioUrl} audioRef={audioRef} />
            ) : null}

            {/* Tabbed content — same 2-tab shape as drill feedback. */}
            {isAnalyzed ? (
                <FeedbackTabs
                    now={
                        <>
                            <AnalysisView
                                analysis={analysis}
                                onSeekToSecond={seekToSecond}
                                section="overview"
                                captureId={captureId}
                                uid={uid}
                                corrections={corrections}
                            />
                            {/* "Was this helpful?" sits right after the coaching,
                                before the transcript — the natural rate-it moment,
                                not buried at the bottom. */}
                            <ReactionBar source="capture" itemId={captureId} />
                            {transcript.length > 0 && (
                                <StaggerItem order={2}>
                                    <Kicker>Transcript</Kicker>
                                    <div className="mt-3 border-t border-border/50 pt-3">
                                        <TranscriptView
                                            transcript={transcript}
                                            teachableMoments={[
                                                ...(analysis.fixTheseFirst ??
                                                    []),
                                                ...(analysis.moreMoments ?? []),
                                            ]}
                                            turnRewrites={analysis.turnRewrites}
                                            onSeekToSecond={seekToSecond}
                                            captureId={captureId}
                                            corrections={corrections}
                                        />
                                    </div>
                                </StaggerItem>
                            )}
                        </>
                    }
                    improved={
                        <AnalysisView
                            analysis={analysis}
                            transcript={transcript}
                            onSeekToSecond={seekToSecond}
                            section="rewrites"
                            captureId={captureId}
                            uid={uid}
                            corrections={corrections}
                        />
                    }
                />
            ) : capture.status !== "analyzed" ? (
                <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
                    <div className="flex items-center justify-center gap-2">
                        {!capture.status.endsWith("_failed") &&
                            capture.status !== "rejected" && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                        <p className="text-sm text-muted-foreground">
                            {friendlyStatus(capture.status)}
                        </p>
                    </div>
                </div>
            ) : null}

            {/* Delete confirmation */}
            <Dialog
                open={confirmDeleteOpen}
                onOpenChange={(open) => {
                    if (!open) setConfirmDeleteOpen(false);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this capture?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete{" "}
                            <strong>{title}</strong> and its recording. This
                            action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="destructive"
                            onClick={() => void handleConfirmDelete()}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmDeleteOpen(false)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* One-time page guide — arms only once the analysis (and
                    its tour targets) are on screen. */}
            <PageTour
                page="conversation"
                uid={uid}
                ready={Boolean(isAnalyzed)}
            />
        </div>
    );
}
