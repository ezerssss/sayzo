"use client";

import ky from "ky";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Lock, Play, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AnalysisView } from "@/components/conversations/analysis-view";
import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { TranscriptView } from "@/components/conversations/transcript-view";
import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { CreditsBanner } from "@/components/credits/credits-banner";
import { CreditsIndicator } from "@/components/credits/credits-indicator";
import { AudioPlayer } from "@/components/session/audio-player";
import { Button, buttonVariants } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCapture } from "@/hooks/use-capture";
import { usePracticeSessionForCapture } from "@/hooks/use-practice-session-for-capture";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/utils";
import { getKyErrorMessage, isKyHttpStatus } from "@/lib/ky-error-message";
import type { CaptureStatus, CaptureType } from "@/types/captures";

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

function countSpeakers(transcript: CaptureType["agentTranscript"]): number {
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
        ky.get(`/api/captures/${captureId}/audio-url`, {
            searchParams: { uid },
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
    }, [captureId, uid, audioStoragePath]);

    const transcript = useMemo(() => {
        if (!capture) return [];
        return capture.serverTranscript ?? capture.agentTranscript;
    }, [capture]);

    if (loading && !capture) {
        return (
            <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <p className="text-sm text-muted-foreground">
                    Loading conversation…
                </p>
            </section>
        );
    }

    if (!capture) {
        return (
            <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
                <Link
                    href="/app?tab=captures"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Captures
                </Link>
                <p className="mt-4 text-sm text-destructive" role="alert">
                    Conversation not found.
                </p>
            </section>
        );
    }

    const title = capture.serverTitle ?? capture.title;
    const summary = capture.serverSummary ?? capture.summary;
    const duration = formatDuration(capture.durationSecs);
    const speakerCount = countSpeakers(transcript);
    const analysis = capture.analysis;
    const isAnalyzed = capture.status === "analyzed" && analysis;

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
            const res = await ky
                .post(`/api/captures/${captureId}/practice`, {
                    json: { uid },
                    timeout: 60_000,
                })
                .json<{ sessionId: string }>();
            track("scenario_replay_started", {});
            track("credit_consumed", { feature: "replay" });
            router.push(`/app/drills/${res.sessionId}`);
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
            await ky.delete(`/api/captures/${captureId}`, {
                json: { uid },
                timeout: 30_000,
            });
            router.push("/app?tab=captures");
        } catch (err) {
            setPracticeError(
                await getKyErrorMessage(
                    err,
                    "Could not delete capture.",
                ),
            );
        } finally {
            setDeleting(false);
        }
    };

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <CreditsBanner />
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/app?tab=captures"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Captures
                </Link>
                <div className="flex items-center gap-2">
                    <CreditsIndicator />
                    {capture.status === "analyzed" &&
                        (practiceSession ? (
                            <Link
                                href={`/app/drills/${practiceSession.id}`}
                                className={cn(buttonVariants({ size: "sm" }))}
                            >
                                <ArrowRight className="h-4 w-4" />
                                {practiceSession.completionStatus === "pending"
                                    ? "Continue practicing"
                                    : "View practice results"}
                            </Link>
                        ) : (
                            <Button
                                size="sm"
                                onClick={() => void handlePractice()}
                                disabled={practicing}
                                className={cn(
                                    creditGate.isExhausted && "opacity-60",
                                )}
                                title={
                                    creditGate.isExhausted
                                        ? "You're out of Sayzo credits"
                                        : undefined
                                }
                            >
                                {practicing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : creditGate.isExhausted ? (
                                    <Lock className="h-4 w-4" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Practice this conversation
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

            {practiceError && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                    {practiceError}
                </p>
            )}

            {/* Title block */}
            <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDate(capture.startedAt)}</span>
                    {duration && (
                        <>
                            <span className="text-muted-foreground/50">
                                &middot;
                            </span>
                            <span>{duration}</span>
                        </>
                    )}
                    <span className="text-muted-foreground/50">&middot;</span>
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
                <h2 className="mt-1 text-lg font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
            </div>

            {/* Audio player */}
            {audioLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading audio...
                </div>
            ) : audioUrl ? (
                <AudioPlayer
                    src={audioUrl}
                    audioRef={audioRef}
                    className="mt-4"
                />
            ) : null}

            {/* Tabbed content — mirrors drill SessionFeedbackSection layout */}
            {isAnalyzed ? (
                <Tabs defaultValue="main" className="mt-6">
                    <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                        <TabsTrigger value="main" className="shrink-0">
                            Main
                        </TabsTrigger>
                        <TabsTrigger value="coaching" className="shrink-0">
                            Coaching
                        </TabsTrigger>
                        <TabsTrigger value="rewrites" className="shrink-0">
                            Improved Versions
                        </TabsTrigger>
                    </TabsList>

                    {/* Main tab: overview + transcript */}
                    <TabsContent value="main" className="mt-3 space-y-4">
                        <AnalysisView
                            analysis={analysis}
                            onSeekToSecond={seekToSecond}
                            section="overview"
                            captureId={captureId}
                            uid={uid}
                        />
                        {transcript.length > 0 && (
                            <div className="rounded-xl border border-border/70 p-4">
                                <p className="text-sm font-medium mb-3">
                                    Transcript
                                </p>
                                <TranscriptView
                                    transcript={transcript}
                                    teachableMoments={analysis.teachableMoments}
                                    nativeSpeakerRewrites={
                                        analysis.nativeSpeakerRewrites
                                    }
                                    onSeekToSecond={seekToSecond}
                                />
                            </div>
                        )}
                    </TabsContent>

                    {/* Coaching tab: dimensional findings + teachable moments + metrics */}
                    <TabsContent value="coaching" className="mt-3">
                        <AnalysisView
                            analysis={analysis}
                            onSeekToSecond={seekToSecond}
                            section="coaching"
                            captureId={captureId}
                            uid={uid}
                        />
                    </TabsContent>

                    {/* Rewrites tab: flowing transcript with improved versions */}
                    <TabsContent value="rewrites" className="mt-3">
                        <AnalysisView
                            analysis={analysis}
                            onSeekToSecond={seekToSecond}
                            section="rewrites"
                            transcript={transcript}
                            captureId={captureId}
                            uid={uid}
                        />
                    </TabsContent>
                </Tabs>
            ) : capture.status !== "analyzed" ? (
                <div className="mt-6 rounded-xl border border-dashed border-border/70 p-6 text-center">
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
                        <DialogTitle>
                            Delete this capture?
                        </DialogTitle>
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
        </section>
    );
}
