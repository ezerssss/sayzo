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
import { FocusDashboard } from "@/components/focus/focus-dashboard";
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
import { StreakDashboard } from "@/components/session/streak-dashboard";
import { cn } from "@/lib/utils";
import { RECOMMENDED_SPEAKING_DRILL_CATEGORIES } from "@/types/sessions";
import type { SessionType } from "@/types/sessions";
import type { CaptureType } from "@/types/captures";

type DashboardTab = "drills" | "captures" | "focus";

type Props = {
    uid: string | undefined;
    sessions: SessionType[];
    practiceSessions: SessionType[];
    loading: boolean;
    error: string | null;
    captures: CaptureType[];
    capturesLoading: boolean;
    capturesError: string | null;
    defaultTab?: DashboardTab;
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
    status_update: "A quick update on what you're working on",
    project_walkthrough: "Explain your project or product out loud",
    stakeholder_alignment: "Make the case for something you care about",
    difficult_conversation: "Practice a hard thing you need to say",
    self_introduction: "Introduce yourself",
    personal_reflection: "Talk through your values, motivations, and story",
    interview_behavioral: "\"Tell me about a time you…\"",
    interview_situational:
        "\"What would you do if…\" or \"What do you think about…\"",
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
        uid,
        sessions,
        practiceSessions,
        loading,
        error,
        captures,
        capturesLoading,
        capturesError,
        defaultTab = "drills",
        onSignOut,
        onStartNewDrill,
        onDeleteSession,
        onDeleteCapture,
    } = props;

    const creditGate = useCreditGate();
    const outOfCredits = creditGate.isExhausted;
    const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTab);
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
    const currentDrillIsPending =
        currentSession?.completionStatus === "pending";
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

            <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as DashboardTab)}
                className="flex min-h-0 flex-1 flex-col"
            >
                {/* Top nav bar — full width */}
                <div className="border-b border-border/50 bg-card/50 px-8">
                    <div className="mx-auto flex max-w-4xl items-end justify-between gap-4">
                        <TabsList className="-mb-px h-auto w-auto gap-6 rounded-none bg-transparent p-0">
                            <TabsTrigger
                                value="drills"
                                className="rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-1 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Drills
                            </TabsTrigger>
                            <TabsTrigger
                                value="captures"
                                className="rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-1 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Captures
                            </TabsTrigger>
                            <TabsTrigger
                                value="focus"
                                className="rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-1 py-3 text-sm font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            >
                                Focus
                            </TabsTrigger>
                        </TabsList>
                        <div className="flex items-center gap-2 py-3">
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
                    {/* Hero — your next drill */}
                    {!showCategoryPicker ? (
                        currentDrillIsPending && currentSession ? (
                            <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-8 shadow-sm">
                                <div
                                    aria-hidden
                                    className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
                                />
                                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="flex-1 space-y-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                                            Pick up where you left off
                                        </p>
                                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                                            {currentSession.plan.scenario.title}
                                        </h2>
                                        <p className="text-sm text-muted-foreground sm:text-base">
                                            {currentSession.plan.skillTarget}
                                        </p>
                                    </div>
                                    <Link
                                        href={drillHref(currentSession)}
                                        className={cn(
                                            buttonVariants({ size: "lg" }),
                                            "shrink-0",
                                        )}
                                    >
                                        <ArrowRight className="h-4 w-4" />
                                        Go to drill
                                    </Link>
                                </div>
                            </div>
                        ) : (
                            <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-8 shadow-sm">
                                <div
                                    aria-hidden
                                    className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
                                />
                                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="flex-1 space-y-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                                            Ready for your next drill
                                        </p>
                                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                                            {currentSession
                                                ? "Start another round"
                                                : "Let's get you warmed up"}
                                        </h2>
                                        <p className="text-sm text-muted-foreground sm:text-base">
                                            Short, focused practice — and real feedback on how you sounded.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => {
                                            if (!creditGate.guard()) return;
                                            setShowCategoryPicker(true);
                                            setCreateError(null);
                                        }}
                                        disabled={creatingDrill}
                                        size="lg"
                                        className={cn(
                                            "shrink-0",
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
                                        Start a drill
                                    </Button>
                                </div>
                            </div>
                        )
                    ) : null}

                    {/* Quiet secondary action — start a different drill */}
                    {!showCategoryPicker && currentDrillIsPending ? (
                        <div className="-mt-2 flex justify-center">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!creditGate.guard()) return;
                                    setShowCategoryPicker(true);
                                    setCreateError(null);
                                }}
                                disabled={creatingDrill}
                                className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                            >
                                or start a different drill
                            </button>
                        </div>
                    ) : null}

                    {/* Quick-start drill panel */}
                    {showCategoryPicker ? (
                        <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-8 shadow-sm">
                            <div
                                aria-hidden
                                className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
                            />
                            <div className="relative space-y-6">
                                {/* Primary action: start immediately */}
                                <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                                    <div className="flex-1 space-y-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                                            Ready to practice?
                                        </p>
                                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                                            What do you want to work on?
                                        </h2>
                                        <p className="text-sm text-muted-foreground sm:text-base">
                                            We&apos;ll pick the best drill based on your progress — or choose a category below.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => void handleStartDrill()}
                                        disabled={creatingDrill}
                                        size="lg"
                                        className={cn(
                                            "shrink-0",
                                            selectedCategory === "__surprise__" &&
                                                creatingDrill &&
                                                "pointer-events-none",
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
                                        className="w-full rounded-lg border border-sky-100 bg-white/60 px-4 py-3 text-left text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-sky-200 hover:bg-white/80 hover:text-foreground"
                                        onClick={() => setShowCategoryGrid(true)}
                                    >
                                        Or pick a specific category...
                                    </button>
                                ) : (
                                    <div className="border-t border-sky-100 pt-4">
                                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-sky-700">
                                            Pick a category
                                        </p>
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {RECOMMENDED_SPEAKING_DRILL_CATEGORIES.map(
                                                (category) => {
                                                    const isSelected = selectedCategory === category;
                                                    return (
                                                        <button
                                                            key={category}
                                                            type="button"
                                                            disabled={creatingDrill}
                                                            className={cn(
                                                                "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed",
                                                                isSelected
                                                                    ? "border-sky-300 bg-sky-50"
                                                                    : "border-sky-100 bg-white/60 backdrop-blur-sm hover:border-sky-200 hover:bg-white/80 disabled:opacity-50",
                                                            )}
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
                        </div>
                    ) : null}

                    {!loading && !error ? (
                        <StreakDashboard sessions={sessions} />
                    ) : null}

                    {loading ? (
                        <p className="text-sm text-muted-foreground">
                            Loading your sessions...
                        </p>
                    ) : error ? (
                        <p className="text-sm text-destructive">{error}</p>
                    ) : pastSessions.length === 0 ? (
                        <p className="pt-2 text-center text-xs text-muted-foreground/70">
                            No past sessions yet — finish your first drill and it&apos;ll show up here.
                        </p>
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
                            Real conversations from your calls, recorded quietly. Get feedback on how you did, and turn any moment into a drill to practice again.
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
                                subhead="The desktop companion runs quietly on your machine and captures the conversations worth coaching on. Pick your OS below to download the installer."
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

                {/* ── Focus tab ── */}
                <TabsContent value="focus" className="mt-0 flex-1">
                    <FocusDashboard
                        uid={uid}
                        onStartDrill={() => {
                            if (!creditGate.guard()) return;
                            setActiveTab("drills");
                            setShowCategoryPicker(true);
                            setCreateError(null);
                        }}
                    />
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
