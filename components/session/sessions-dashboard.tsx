"use client";

import Link from "next/link";
import {
    ArrowRight,
    CheckCircle,
    Clock,
    Download,
    Loader2,
    Lock,
    Plus,
    SkipForward,
    Trash2,
    XCircle,
} from "lucide-react";
import { useState } from "react";

import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { CreditsBanner } from "@/components/credits/credits-banner";
import { CreditsIndicator } from "@/components/credits/credits-indicator";
import { InstallPanel } from "@/components/install/install-panel";
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
import { cn } from "@/lib/utils";
import { RECOMMENDED_SPEAKING_DRILL_CATEGORIES } from "@/types/sessions";
import type { SessionType } from "@/types/sessions";
import type { CaptureType } from "@/types/captures";

type Props = {
    sessions: SessionType[];
    practiceSessions: SessionType[];
    loading: boolean;
    error: string | null;
    captures: CaptureType[];
    capturesLoading: boolean;
    capturesError: string | null;
    userLabel: string;
    defaultTab?: "drills" | "captures";
    onSignOut: () => void;
    onStartNewDrill: (category?: string) => Promise<void>;
    onDeleteSession: (sessionId: string) => Promise<void>;
    onDeleteCapture: (captureId: string) => Promise<void>;
};

function formatCategory(slug: string): string {
    return slug
        .replaceAll("_", " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
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

function drillHref(session: SessionType): string {
    if (session.completionStatus === "pending") {
        return `/app/drills/${session.id}`;
    }
    return `/app/drills/${session.id}/summary`;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    presentation: "Formal talk, pitch, or deck-backed explanation",
    status_update: "Standup, sprint review, or progress report",
    demo_walkthrough: "Live product or workflow walkthrough",
    meeting_contribution: "Discussion, alignment, or advocating a view",
    impromptu: "Little prep, thinking on your feet",
    interview_behavioral: "\"Tell me about a time\" / STAR-style",
    interview_situational: "Hypothetical or \"what would you do\" prompts",
    self_introduction: "Elevator pitch or professional intro",
    personal_reflection: "Strengths, values, career narrative",
    difficult_conversation: "Feedback, pushback, or delicate alignment",
    stakeholder_alignment: "Persuasion, buy-in, or executive summary",
};

function StatusBadge({ status }: { status: SessionType["completionStatus"] }) {
    switch (status) {
        case "passed":
            return (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle className="h-3 w-3" />
                    Completed
                </span>
            );
        case "skipped":
            return (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    <SkipForward className="h-3 w-3" />
                    Skipped
                </span>
            );
        case "needs_retry":
            return (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <XCircle className="h-3 w-3" />
                    Needs retry
                </span>
            );
        case "pending":
            return (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    <Clock className="h-3 w-3" />
                    In progress
                </span>
            );
    }
}

export function SessionsDashboard(props: Readonly<Props>) {
    const {
        sessions,
        practiceSessions,
        loading,
        error,
        captures,
        capturesLoading,
        capturesError,
        userLabel,
        defaultTab = "drills",
        onSignOut,
        onStartNewDrill,
        onDeleteSession,
        onDeleteCapture,
    } = props;

    const creditGate = useCreditGate();
    const outOfCredits = creditGate.isExhausted;
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showCategoryGrid, setShowCategoryGrid] = useState(false);
    const [creatingDrill, setCreatingDrill] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [confirmDeleteSession, setConfirmDeleteSession] = useState<SessionType | null>(null);

    const [deletingCaptureId, setDeletingCaptureId] = useState<string | null>(null);
    const [captureDeleteError, setCaptureDeleteError] = useState<string | null>(null);
    const [confirmDeleteCapture, setConfirmDeleteCapture] = useState<CaptureType | null>(null);

    const handleDeleteClick = (e: React.MouseEvent, session: SessionType) => {
        e.stopPropagation();
        e.preventDefault();
        setDeleteError(null);
        setConfirmDeleteSession(session);
    };

    const handleConfirmDelete = async () => {
        if (!confirmDeleteSession) return;
        const sessionId = confirmDeleteSession.id;
        setConfirmDeleteSession(null);
        setDeletingSessionId(sessionId);
        try {
            await onDeleteSession(sessionId);
        } catch (err) {
            setDeleteError(
                err instanceof Error
                    ? err.message
                    : "Could not delete session.",
            );
        } finally {
            setDeletingSessionId(null);
        }
    };

    const handleCaptureDeleteClick = (e: React.MouseEvent, capture: CaptureType) => {
        e.stopPropagation();
        e.preventDefault();
        setCaptureDeleteError(null);
        setConfirmDeleteCapture(capture);
    };

    const handleConfirmCaptureDelete = async () => {
        if (!confirmDeleteCapture) return;
        const id = confirmDeleteCapture.id!;
        setConfirmDeleteCapture(null);
        setDeletingCaptureId(id);
        try {
            await onDeleteCapture(id);
        } catch (err) {
            setCaptureDeleteError(
                err instanceof Error
                    ? err.message
                    : "Could not delete capture.",
            );
        } finally {
            setDeletingCaptureId(null);
        }
    };

    const currentSession = sessions[0] ?? null;
    const pastSessions = sessions.filter(
        (s) => s.completionStatus !== "pending" || s.id !== currentSession?.id,
    );

    const handleStartDrill = async (category?: string) => {
        setSelectedCategory(category ?? "__surprise__");
        setCreatingDrill(true);
        setCreateError(null);
        try {
            await onStartNewDrill(category);
            setShowCategoryPicker(false);
            setShowCategoryGrid(false);
        } catch (err) {
            setCreateError(
                err instanceof Error
                    ? err.message
                    : "Could not create a new drill.",
            );
        } finally {
            setCreatingDrill(false);
            setSelectedCategory(null);
        }
    };

    return (
        <section className="fixed inset-0 flex flex-col overflow-y-auto bg-background">
            <CreditsBanner />

            <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
                {/* Top nav bar — full width */}
                <div className="border-b border-border/50 bg-card/50 px-8 py-3">
                    <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                        <TabsList>
                            <TabsTrigger value="drills">Drills</TabsTrigger>
                            <TabsTrigger value="captures">Captures</TabsTrigger>
                        </TabsList>
                        <div className="flex items-center gap-2">
                            <CreditsIndicator />
                            <Link
                                href="/install"
                                className={cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    "text-muted-foreground",
                                )}
                            >
                                <Download className="h-3.5 w-3.5" />
                                Install
                            </Link>
                            <Button variant="outline" size="sm" onClick={onSignOut}>
                                Sign out
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ── Drills tab ── */}
                <TabsContent value="drills" className="mt-0 flex-1">
                    <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
                    {/* Drill header with new drill action */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight">
                                My Drills
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Practice speaking scenarios
                            </p>
                        </div>
                        <Button
                            onClick={() => {
                                if (!creditGate.guard()) return;
                                setShowCategoryPicker((v) => !v);
                                setCreateError(null);
                            }}
                            disabled={creatingDrill}
                            size="sm"
                            className={cn(
                                outOfCredits &&
                                    "opacity-60 [&>svg:first-child]:hidden",
                            )}
                            title={
                                outOfCredits
                                    ? "You're out of Sayzo credits"
                                    : undefined
                            }
                        >
                            {outOfCredits ? (
                                <Lock className="h-4 w-4" />
                            ) : (
                                <Plus className="h-4 w-4" />
                            )}
                            New drill
                        </Button>
                    </div>

                    {/* Quick-start drill panel */}
                    {showCategoryPicker ? (
                        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-3">
                            {/* Primary action: start immediately */}
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium">
                                        Ready to practice?
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        We'll pick the best drill based on your progress
                                    </p>
                                </div>
                                <Button
                                    onClick={() => void handleStartDrill()}
                                    disabled={creatingDrill}
                                    className={cn(
                                        selectedCategory === "__surprise__" && creatingDrill && "pointer-events-none",
                                    )}
                                >
                                    {selectedCategory === "__surprise__" && creatingDrill ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <ArrowRight className="h-4 w-4" />
                                    )}
                                    {selectedCategory === "__surprise__" && creatingDrill
                                        ? "Building..."
                                        : "Start a drill"}
                                </Button>
                            </div>

                            {/* Toggle to show categories */}
                            {!showCategoryGrid ? (
                                <button
                                    type="button"
                                    className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground"
                                    onClick={() => setShowCategoryGrid(true)}
                                >
                                    Or pick a specific category...
                                </button>
                            ) : (
                                <>
                                    <div className="border-t border-border/50 pt-3">
                                        <p className="text-xs font-medium text-muted-foreground mb-2">
                                            Pick a category
                                        </p>
                                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                                            {RECOMMENDED_SPEAKING_DRILL_CATEGORIES.map(
                                                (category) => {
                                                    const isSelected = selectedCategory === category;
                                                    return (
                                                        <button
                                                            key={category}
                                                            type="button"
                                                            disabled={creatingDrill}
                                                            className={`rounded-lg border p-2.5 text-left transition-colors disabled:cursor-not-allowed ${
                                                                isSelected
                                                                    ? "border-foreground/30 bg-muted"
                                                                    : "border-border/50 bg-background hover:border-border hover:bg-muted/50 disabled:opacity-50"
                                                            }`}
                                                            onClick={() =>
                                                                void handleStartDrill(category)
                                                            }
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isSelected ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                                                ) : null}
                                                                <p className="text-sm font-medium">
                                                                    {formatCategory(category)}
                                                                </p>
                                                            </div>
                                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                                {isSelected
                                                                    ? "Building your drill..."
                                                                    : (CATEGORY_DESCRIPTIONS[category] ?? "")}
                                                            </p>
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {createError ? (
                                <p
                                    className="text-sm text-destructive"
                                    role="alert"
                                >
                                    {createError}
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    {/* Current drill CTA */}
                    {currentSession && !showCategoryPicker ? (
                        <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        {currentSession.completionStatus === "pending"
                                            ? "Current Drill"
                                            : "Latest Drill"}
                                    </p>
                                    <h2 className="mt-1 text-lg font-semibold">
                                        {currentSession.plan.scenario.title}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {currentSession.plan.skillTarget}
                                    </p>
                                </div>
                                <Link
                                    href={drillHref(currentSession)}
                                    className={cn(buttonVariants())}
                                >
                                    <ArrowRight className="h-4 w-4" />
                                    {currentSession.completionStatus === "pending"
                                        ? "Go to drill"
                                        : "Continue"}
                                </Link>
                            </div>
                        </div>
                    ) : null}

                    {loading ? (
                        <p className="text-sm text-muted-foreground">
                            Loading your sessions...
                        </p>
                    ) : error ? (
                        <p className="text-sm text-destructive">{error}</p>
                    ) : pastSessions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                No past sessions yet. Complete your first drill to see
                                it here!
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                Past sessions ({pastSessions.length})
                            </h3>
                            {deleteError ? (
                                <p className="text-sm text-destructive" role="alert">
                                    {deleteError}
                                </p>
                            ) : null}
                            <div className="space-y-1">
                                {pastSessions.map((session) => {
                                    const isDeleting = deletingSessionId === session.id;
                                    return (
                                        <div
                                            key={session.id}
                                            className={`group rounded-lg border border-border/50 bg-background transition-colors hover:border-border hover:bg-muted/50 ${
                                                isDeleting ? "opacity-50" : ""
                                            }`}
                                        >
                                            <Link
                                                href={drillHref(session)}
                                                className={`block w-full p-3 text-left ${isDeleting ? "pointer-events-none" : ""}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {
                                                                session.plan.scenario
                                                                    .title
                                                            }
                                                        </p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatCategory(
                                                                    session.plan
                                                                        .scenario
                                                                        .category,
                                                                )}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground/50">
                                                                ·
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatDate(
                                                                    session.createdAt,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <StatusBadge
                                                            status={
                                                                session.completionStatus
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={isDeleting}
                                                            className="rounded-md p-1 text-muted-foreground/0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:text-muted-foreground/60"
                                                            title="Delete session"
                                                            onClick={(e) =>
                                                                handleDeleteClick(
                                                                    e,
                                                                    session,
                                                                )
                                                            }
                                                        >
                                                            {isDeleting ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Conversation Practice section */}
                    {practiceSessions.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                Conversation Practice ({practiceSessions.length})
                            </h3>
                            <div className="space-y-1">
                                {practiceSessions.map((session) => {
                                    const isDeleting =
                                        deletingSessionId === session.id;
                                    return (
                                        <div
                                            key={session.id}
                                            className={`group rounded-lg border border-border/50 bg-background transition-colors hover:border-border hover:bg-muted/50 ${
                                                isDeleting ? "opacity-50" : ""
                                            }`}
                                        >
                                            <Link
                                                href={drillHref(session)}
                                                className={`block w-full p-3 text-left ${isDeleting ? "pointer-events-none" : ""}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {
                                                                session.plan.scenario
                                                                    .title
                                                            }
                                                        </p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatCategory(
                                                                    session.plan
                                                                        .scenario
                                                                        .category,
                                                                )}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground/50">
                                                                ·
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatDate(
                                                                    session.createdAt,
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <StatusBadge
                                                            status={
                                                                session.completionStatus
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={isDeleting}
                                                            className="rounded-md p-1 text-muted-foreground/0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:text-muted-foreground/60"
                                                            title="Delete session"
                                                            onClick={(e) =>
                                                                handleDeleteClick(
                                                                    e,
                                                                    session,
                                                                )
                                                            }
                                                        >
                                                            {isDeleting ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </div>
                </TabsContent>

                {/* ── Captures tab ── */}
                <TabsContent value="captures" className="mt-0 flex-1">
                    <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">
                            My Captures
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Real conversations recorded and analyzed
                        </p>
                    </div>
                    {capturesLoading ? (
                        <p className="text-sm text-muted-foreground">
                            Loading your captures...
                        </p>
                    ) : capturesError ? (
                        <p className="text-sm text-destructive">{capturesError}</p>
                    ) : captures.length === 0 ? (
                        <div className="space-y-4">
                            <InstallPanel
                                headline="Nothing here yet — install the companion to start capturing"
                                subhead="The desktop companion runs quietly on your machine and captures the conversations worth coaching on. One command to install."
                                showViewAllLink
                            />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <h3 className="text-sm font-medium text-muted-foreground">
                                Captures ({captures.length})
                            </h3>
                            {captureDeleteError ? (
                                <p className="text-sm text-destructive" role="alert">
                                    {captureDeleteError}
                                </p>
                            ) : null}
                            <div className="space-y-1">
                                {captures.map((capture, idx) => {
                                    const captureId = capture.id ?? `capture-${idx}`;
                                    const isDeleting = deletingCaptureId === captureId;
                                    const title =
                                        capture.serverTitle ?? capture.title;
                                    const duration = formatDuration(
                                        capture.durationSecs,
                                    );

                                    return (
                                        <div
                                            key={captureId}
                                            className={`group rounded-lg border border-border/50 bg-background transition-colors hover:border-border hover:bg-muted/50 ${
                                                isDeleting ? "opacity-50" : ""
                                            }`}
                                        >
                                            <Link
                                                href={`/app/conversations/${captureId}`}
                                                className={`block w-full p-3 text-left ${isDeleting ? "pointer-events-none" : ""}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {title}
                                                        </p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatDate(
                                                                    capture.startedAt,
                                                                )}
                                                            </span>
                                                            {duration && (
                                                                <>
                                                                    <span className="text-xs text-muted-foreground/50">
                                                                        &middot;
                                                                    </span>
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {duration}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <CaptureStatusBadge
                                                            status={capture.status}
                                                            rejectionReason={
                                                                capture.rejectionReason
                                                            }
                                                            error={capture.error}
                                                        />
                                                        <button
                                                            type="button"
                                                            disabled={isDeleting}
                                                            className="rounded-md p-1 text-muted-foreground/0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:text-muted-foreground/60"
                                                            title="Delete capture"
                                                            onClick={(e) =>
                                                                handleCaptureDeleteClick(
                                                                    e,
                                                                    capture,
                                                                )
                                                            }
                                                        >
                                                            {isDeleting ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Delete session confirmation */}
            <Dialog
                open={confirmDeleteSession !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmDeleteSession(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this session?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete{" "}
                            <strong>
                                {confirmDeleteSession?.plan.scenario.title}
                            </strong>{" "}
                            and its recording. This action cannot be undone.
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
                            onClick={() => setConfirmDeleteSession(null)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete capture confirmation */}
            <Dialog
                open={confirmDeleteCapture !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmDeleteCapture(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this capture?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete{" "}
                            <strong>
                                {confirmDeleteCapture?.serverTitle ??
                                    confirmDeleteCapture?.title}
                            </strong>{" "}
                            and its recording. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="destructive"
                            onClick={() => void handleConfirmCaptureDelete()}
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmDeleteCapture(null)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
