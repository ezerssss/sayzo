"use client";

import Link from "next/link";
import {
    ArrowRight,
    CheckCircle,
    Clock,
    Download,
    Loader2,
    MessageSquare,
    Plus,
    SkipForward,
    Trash2,
    XCircle,
} from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { RECOMMENDED_SPEAKING_DRILL_CATEGORIES } from "@/types/sessions";
import type { SessionType } from "@/types/sessions";

type Props = {
    sessions: SessionType[];
    practiceSessions: SessionType[];
    loading: boolean;
    error: string | null;
    userLabel: string;
    onSignOut: () => void;
    onStartNewDrill: (category?: string) => Promise<void>;
    onDeleteSession: (sessionId: string) => Promise<void>;
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
        userLabel,
        onSignOut,
        onStartNewDrill,
        onDeleteSession,
    } = props;

    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [creatingDrill, setCreatingDrill] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [confirmDeleteSession, setConfirmDeleteSession] = useState<SessionType | null>(null);

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
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        My Drills
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Signed in as{" "}
                        <span className="font-medium text-foreground">
                            {userLabel}
                        </span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
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
                    <Link
                        href="/app/conversations"
                        className={cn(buttonVariants({ variant: "outline" }))}
                    >
                        <MessageSquare className="h-4 w-4" />
                        Real Conversations
                    </Link>
                    <Button
                        onClick={() => {
                            setShowCategoryPicker((v) => !v);
                            setCreateError(null);
                        }}
                        disabled={creatingDrill}
                    >
                        <Plus className="h-4 w-4" />
                        New drill
                    </Button>
                    <Button variant="outline" onClick={onSignOut}>
                        Sign out
                    </Button>
                </div>
            </div>

            {/* Category picker */}
            {showCategoryPicker ? (
                <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <h3 className="text-sm font-medium">
                        What kind of drill?
                    </h3>

                    {/* Surprise me option */}
                    <button
                        type="button"
                        disabled={creatingDrill}
                        className={`mt-3 w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                            selectedCategory === "__surprise__"
                                ? "border-foreground/30 bg-muted"
                                : "border-border/50 bg-background hover:border-border hover:bg-muted/50 disabled:opacity-50"
                        }`}
                        onClick={() => void handleStartDrill()}
                    >
                        <div className="flex items-center gap-2">
                            {selectedCategory === "__surprise__" ? (
                                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            ) : null}
                            <p className="text-sm font-medium">Surprise me</p>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {selectedCategory === "__surprise__"
                                ? "Building your drill..."
                                : "Let the AI pick the best drill for you based on your progress"}
                        </p>
                    </button>

                    {/* Category grid */}
                    <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {RECOMMENDED_SPEAKING_DRILL_CATEGORIES.map(
                            (category) => {
                                const isSelected = selectedCategory === category;
                                return (
                                    <button
                                        key={category}
                                        type="button"
                                        disabled={creatingDrill}
                                        className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${
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
                                                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
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

                    {createError ? (
                        <p
                            className="mt-3 text-sm text-destructive"
                            role="alert"
                        >
                            {createError}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {/* Current drill CTA */}
            {currentSession && !showCategoryPicker ? (
                <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4">
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
                <p className="mt-6 text-sm text-muted-foreground">
                    Loading your sessions...
                </p>
            ) : error ? (
                <p className="mt-6 text-sm text-destructive">{error}</p>
            ) : pastSessions.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-border/70 p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        No past sessions yet. Complete your first drill to see
                        it here!
                    </p>
                </div>
            ) : (
                <div className="mt-6 space-y-2">
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
                <div className="mt-6 space-y-2">
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
        </section>
    );
}
