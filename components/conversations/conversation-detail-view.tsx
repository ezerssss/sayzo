"use client";

import ky from "ky";
import { ArrowLeft, ArrowRight, Loader2, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AnalysisView } from "@/components/conversations/analysis-view";
import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { TranscriptView } from "@/components/conversations/transcript-view";
import { AudioPlayer } from "@/components/session/audio-player";
import { Button } from "@/components/ui/button";
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
import type { CaptureStatus, CaptureType } from "@/types/captures";
import type { SessionType } from "@/types/sessions";

type Props = {
    capture: CaptureType;
    uid: string;
    onBack: () => void;
    onPracticeThisConversation: (captureId: string) => Promise<void>;
    onDelete: (captureId: string) => Promise<void>;
    /** Existing practice session for this capture, if any. */
    practiceSession?: SessionType;
    /** Navigate to the practice session's drill view. */
    onGoToPracticeSession?: (sessionId: string) => void;
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
    const {
        capture: initialCapture,
        uid,
        onBack,
        onPracticeThisConversation,
        onDelete,
        practiceSession,
        onGoToPracticeSession,
    } = props;

    // Real-time listener — starts from the list data, then stays in sync
    const capture = useCapture(initialCapture.id, initialCapture);

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioLoading, setAudioLoading] = useState(false);
    const [practicing, setPracticing] = useState(false);
    const [practiceError, setPracticeError] = useState<string | null>(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [resetting, setResetting] = useState(false);

    const captureId = capture.id!;
    const title = capture.serverTitle ?? capture.title;
    const summary = capture.serverSummary ?? capture.summary;
    const transcript = useMemo(
        () => capture.serverTranscript ?? capture.agentTranscript,
        [capture.serverTranscript, capture.agentTranscript],
    );
    const duration = formatDuration(capture.durationSecs);
    const speakerCount = countSpeakers(transcript);
    const analysis = capture.analysis;
    const isAnalyzed = capture.status === "analyzed" && analysis;

    // Fetch signed audio URL on mount
    useEffect(() => {
        let cancelled = false;
        if (!capture.audioStoragePath) return;

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
    }, [captureId, uid, capture.audioStoragePath]);

    const seekToSecond = (seconds: number) => {
        const el = audioRef.current;
        if (!el || !Number.isFinite(seconds)) return;
        el.currentTime = Math.max(0, seconds);
        void el.play();
    };

    const handlePractice = async () => {
        setPracticing(true);
        setPracticeError(null);
        try {
            await onPracticeThisConversation(captureId);
        } catch (err) {
            setPracticeError(
                err instanceof Error
                    ? err.message
                    : "Failed to create practice session.",
            );
        } finally {
            setPracticing(false);
        }
    };

    // DEV ONLY — remove before production
    const handleReset = async () => {
        setResetting(true);
        try {
            await ky.post(`/api/captures/${captureId}/reset`, {
                json: { uid },
                timeout: 15_000,
            });
            onBack();
        } catch {
            // Silently fail
        } finally {
            setResetting(false);
        }
    };

    const handleConfirmDelete = async () => {
        setConfirmDeleteOpen(false);
        setDeleting(true);
        try {
            await onDelete(captureId);
        } catch {
            // Error is handled upstream
        } finally {
            setDeleting(false);
        }
    };

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" />
                    Real Conversations
                </Button>
                <div className="flex items-center gap-2">
                    {capture.status === "analyzed" &&
                        (practiceSession ? (
                            <Button
                                size="sm"
                                onClick={() =>
                                    onGoToPracticeSession?.(
                                        practiceSession.id,
                                    )
                                }
                            >
                                <ArrowRight className="h-4 w-4" />
                                {practiceSession.completionStatus === "pending"
                                    ? "Continue practicing"
                                    : "View practice results"}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={() => void handlePractice()}
                                disabled={practicing}
                            >
                                {practicing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Practice this conversation
                            </Button>
                        ))}
                    {/* DEV ONLY — remove before production */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleReset()}
                        disabled={resetting}
                        title="DEV: Reprocess from scratch"
                    >
                        {resetting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RotateCcw className="h-4 w-4" />
                        )}
                    </Button>
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
                        />
                    </TabsContent>

                    {/* Rewrites tab: flowing transcript with improved versions */}
                    <TabsContent value="rewrites" className="mt-3">
                        <AnalysisView
                            analysis={analysis}
                            onSeekToSecond={seekToSecond}
                            section="rewrites"
                            transcript={transcript}
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
                            Delete this real conversation?
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
