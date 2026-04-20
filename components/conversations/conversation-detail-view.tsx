"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    FileText,
    Lightbulb,
    Loader2,
    Lock,
    Play,
    Sparkles,
    Trash2,
} from "lucide-react";
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
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { getKyErrorMessage, isKyHttpStatus } from "@/lib/ky-error-message";
import type { CaptureStatus, CaptureType } from "@/types/captures";

type Props = {
    captureId: string;
    uid: string;
};

// Mirrors SessionHomeHeader so the conversation detail page shares the same
// chrome as the drill page — same back-link treatment, same title weight,
// same credits indicator placement.
function ConversationDetailHeader() {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                <Link
                    href="/app?tab=captures"
                    className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    My Conversations
                </Link>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Your conversation
                </h1>
            </div>
            <CreditsIndicator />
        </div>
    );
}

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
        return capture.serverTranscript ?? capture.agentTranscript;
    }, [capture]);

    if (loading && !capture) {
        return (
            <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
                <div className="mx-auto w-full max-w-4xl space-y-6 px-8 py-8">
                    <ConversationDetailHeader />
                    <p className="text-sm text-muted-foreground">
                        Loading conversation…
                    </p>
                </div>
            </section>
        );
    }

    if (!capture) {
        return (
            <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
                <div className="mx-auto w-full max-w-4xl space-y-6 px-8 py-8">
                    <ConversationDetailHeader />
                    <p className="text-sm text-destructive" role="alert">
                        Conversation not found.
                    </p>
                </div>
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
            const res = await api
                .post(`/api/captures/${captureId}/practice`, {
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
            await api.delete(`/api/captures/${captureId}`, {
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
        <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-4xl space-y-6 px-8 py-8">
                <CreditsBanner />
                <ConversationDetailHeader />

                {practiceError && (
                    <p className="text-sm text-destructive" role="alert">
                        {practiceError}
                    </p>
                )}

                {/* Title block — uses the sky/indigo hero treatment from
                    the drill dashboard so the conversation detail reads as
                    part of the same product, not a plain detail card. */}
                <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-6 shadow-sm">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
                    />
                    <div className="relative flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                                Captured
                                <span className="mx-1.5 text-sky-700/50">
                                    &middot;
                                </span>
                                <span className="font-normal normal-case text-foreground/80">
                                    {formatDate(capture.startedAt)}
                                </span>
                            </p>
                            <h2 className="mt-2 text-lg font-semibold tracking-tight">
                                {title}
                            </h2>
                            {summary ? (
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
                                        href={`/app/drills/${practiceSession.id}`}
                                        className={cn(
                                            buttonVariants({ size: "sm" }),
                                        )}
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                        {practiceSession.completionStatus ===
                                        "pending"
                                            ? "Continue practicing"
                                            : "View practice results"}
                                    </Link>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={() => void handlePractice()}
                                        disabled={practicing}
                                        className={cn(
                                            creditGate.isExhausted &&
                                                "opacity-60",
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
                                className="border-sky-100 bg-white/60 backdrop-blur-sm hover:border-sky-200 hover:bg-white/80"
                            >
                                {deleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Audio player */}
                {audioLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading audio...
                    </div>
                ) : audioUrl ? (
                    <AudioPlayer src={audioUrl} audioRef={audioRef} />
                ) : null}

                {/* Tabbed content — mirrors drill SessionFeedbackSection layout */}
                {isAnalyzed ? (
                    <Tabs defaultValue="main">
                        <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                            <TabsTrigger value="main" className="shrink-0">
                                <FileText className="size-3.5" />
                                Main
                            </TabsTrigger>
                            <TabsTrigger value="coaching" className="shrink-0">
                                <Lightbulb className="size-3.5" />
                                Coaching
                            </TabsTrigger>
                            <TabsTrigger value="rewrites" className="shrink-0">
                                <Sparkles className="size-3.5" />
                                Improved Version
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
                                <div className="rounded-xl border border-border/70">
                                    <div className="flex items-center justify-between p-4">
                                        <span className="text-sm font-medium">
                                            Transcript
                                        </span>
                                    </div>
                                    <div className="border-t border-border/50 px-4 pb-4 pt-3">
                                        <TranscriptView
                                            transcript={transcript}
                                            teachableMoments={
                                                analysis.teachableMoments
                                            }
                                            nativeSpeakerRewrites={
                                                analysis.nativeSpeakerRewrites
                                            }
                                            onSeekToSecond={seekToSecond}
                                        />
                                    </div>
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
                                captureId={captureId}
                                uid={uid}
                            />
                        </TabsContent>
                    </Tabs>
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
                                <strong>{title}</strong> and its recording.
                                This action cannot be undone.
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
            </div>
        </section>
    );
}
