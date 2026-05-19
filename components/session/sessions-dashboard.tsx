"use client";

import Link from "next/link";
import {
    Apple,
    ArrowRight,
    Check,
    CheckCircle,
    Clock,
    Copy,
    Download,
    Loader2,
    Monitor,
    SkipForward,
    Smartphone,
    Terminal,
    Trash2,
    XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { CreditsBanner } from "@/components/credits/credits-banner";
import { CreditsIndicator } from "@/components/credits/credits-indicator";
import { FocusDashboard } from "@/components/focus/focus-dashboard";
import {
    detectOS,
    otherOS,
    type OS,
    PLATFORMS,
} from "@/components/install/install-panel";
import { SaveLinkActions } from "@/components/mobile/save-link-actions";
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
import { track } from "@/lib/analytics/client";
import { useIsMobile } from "@/lib/device/is-mobile";
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
    return `/app/drills/${session.id}`;
}

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
    const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTab);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [creatingDrill, setCreatingDrill] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(
        null,
    );
    const [createError, setCreateError] = useState<string | null>(null);

    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
        null,
    );
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [confirmDeleteSession, setConfirmDeleteSession] =
        useState<SessionType | null>(null);

    const [deletingCaptureId, setDeletingCaptureId] = useState<string | null>(
        null,
    );
    const [captureDeleteError, setCaptureDeleteError] = useState<
        string | null
    >(null);
    const [confirmDeleteCapture, setConfirmDeleteCapture] =
        useState<CaptureType | null>(null);

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

    const handleCaptureDeleteClick = (
        e: React.MouseEvent,
        capture: CaptureType,
    ) => {
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

    // Today's drill is the latest pending one. The pre-generator guarantees one
    // exists (after onboarding completion or after the previous drill finishes).
    const todaysDrill = sessions.find(
        (s) =>
            s.completionStatus === "pending" &&
            s.processingStatus !== "processing",
    );
    const pastSessions = sessions.filter(
        (s) => s.id !== todaysDrill?.id || s.completionStatus !== "pending",
    );

    const handlePickCategory = async (category?: string) => {
        setSelectedCategory(category ?? "__surprise__");
        setCreatingDrill(true);
        setCreateError(null);
        try {
            await onStartNewDrill(category);
            setPickerOpen(false);
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
                            {captures.length === 0 ? (
                                <Link
                                    href="/install"
                                    className={cn(
                                        buttonVariants({
                                            variant: "ghost",
                                            size: "sm",
                                        }),
                                        "text-muted-foreground",
                                    )}
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Install
                                </Link>
                            ) : null}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onSignOut}
                            >
                                Sign out
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Drills tab — auto-pick hero */}
                <TabsContent value="drills" className="mt-0 flex-1">
                    <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight">
                                Drills
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                A bite-sized speaking practice each day. We
                                pick the drill, you bring 60 seconds.
                            </p>
                        </div>

                        {loading ? (
                            <p className="text-sm text-muted-foreground">
                                Loading your drills…
                            </p>
                        ) : todaysDrill ? (
                            <TodaysDrillHero session={todaysDrill} />
                        ) : (
                            <NoDrillReadyHero
                                onPick={() => setPickerOpen(true)}
                            />
                        )}

                        {todaysDrill ? (
                            <div className="-mt-2 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!creditGate.guard()) return;
                                        setPickerOpen(true);
                                        setCreateError(null);
                                    }}
                                    disabled={creatingDrill}
                                    className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                                >
                                    Want a different drill? →
                                </button>
                            </div>
                        ) : null}

                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : pastSessions.length === 0 &&
                          practiceSessions.length === 0 ? (
                            <p className="pt-2 text-center text-xs text-muted-foreground/70">
                                No past sessions yet — finish your first drill
                                and it&apos;ll show up here.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">
                                    Past sessions (
                                    {pastSessions.length +
                                        practiceSessions.length}
                                    )
                                </h3>
                                {deleteError ? (
                                    <p
                                        className="text-sm text-destructive"
                                        role="alert"
                                    >
                                        {deleteError}
                                    </p>
                                ) : null}
                                <div className="space-y-1">
                                    {[...pastSessions, ...practiceSessions]
                                        .sort(
                                            (a, b) =>
                                                Date.parse(b.createdAt) -
                                                Date.parse(a.createdAt),
                                        )
                                        .map((session) => {
                                            const isDeleting =
                                                deletingSessionId === session.id;
                                            const isReplay =
                                                session.type === "scenario_replay";
                                            return (
                                                <div
                                                    key={session.id}
                                                    className={`group rounded-lg border border-border/50 bg-background transition-colors hover:border-border hover:bg-muted/50 ${
                                                        isDeleting
                                                            ? "opacity-50"
                                                            : ""
                                                    }`}
                                                >
                                                    <Link
                                                        href={drillHref(session)}
                                                        className={`block w-full p-3 text-left ${
                                                            isDeleting
                                                                ? "pointer-events-none"
                                                                : ""
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm font-medium">
                                                                    {
                                                                        session
                                                                            .plan
                                                                            .scenario
                                                                            .title
                                                                    }
                                                                </p>
                                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                    <span className="text-xs text-muted-foreground">
                                                                        {formatCategory(
                                                                            session
                                                                                .plan
                                                                                .scenario
                                                                                .category,
                                                                        )}
                                                                    </span>
                                                                    {isReplay ? (
                                                                        <>
                                                                            <span className="text-xs text-muted-foreground/50">
                                                                                ·
                                                                            </span>
                                                                            <span className="text-xs text-muted-foreground">
                                                                                from a real conversation
                                                                            </span>
                                                                        </>
                                                                    ) : null}
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
                                                                    disabled={
                                                                        isDeleting
                                                                    }
                                                                    className="rounded-md p-1 text-muted-foreground/0 transition-colors hover:bg-destructive/10 hover:text-destructive group-hover:text-muted-foreground/60"
                                                                    title="Delete session"
                                                                    onClick={(
                                                                        e,
                                                                    ) =>
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

                {/* Captures tab */}
                <TabsContent value="captures" className="mt-0 flex-1">
                    <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight">
                                My Captures
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Real conversations from your calls. Get
                                feedback on how you did, and turn any moment
                                into a drill to practice again.
                            </p>
                        </div>
                        {capturesLoading ? (
                            <p className="text-sm text-muted-foreground">
                                Loading your captures…
                            </p>
                        ) : capturesError ? (
                            <p className="text-sm text-destructive">
                                {capturesError}
                            </p>
                        ) : captures.length === 0 ? (
                            <CapturesEmptyState />
                        ) : (
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">
                                    Captures ({captures.length})
                                </h3>
                                {captureDeleteError ? (
                                    <p
                                        className="text-sm text-destructive"
                                        role="alert"
                                    >
                                        {captureDeleteError}
                                    </p>
                                ) : null}
                                <div className="space-y-1">
                                    {captures.map((capture, idx) => {
                                        const captureId =
                                            capture.id ?? `capture-${idx}`;
                                        const isDeleting =
                                            deletingCaptureId === captureId;
                                        const title =
                                            capture.serverTitle ??
                                            capture.title;
                                        const duration = formatDuration(
                                            capture.durationSecs,
                                        );

                                        return (
                                            <div
                                                key={captureId}
                                                className={`group rounded-lg border border-border/50 bg-background transition-colors hover:border-border hover:bg-muted/50 ${
                                                    isDeleting
                                                        ? "opacity-50"
                                                        : ""
                                                }`}
                                            >
                                                <Link
                                                    href={`/app/conversations/${captureId}`}
                                                    className={`block w-full p-3 text-left ${
                                                        isDeleting
                                                            ? "pointer-events-none"
                                                            : ""
                                                    }`}
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
                                                                status={
                                                                    capture.status
                                                                }
                                                                rejectionReason={
                                                                    capture.rejectionReason
                                                                }
                                                                error={
                                                                    capture.error
                                                                }
                                                            />
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    isDeleting
                                                                }
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

                <TabsContent value="focus" className="mt-0 flex-1">
                    <FocusDashboard
                        uid={uid}
                        onStartDrill={() => {
                            if (!creditGate.guard()) return;
                            setActiveTab("drills");
                            setPickerOpen(true);
                            setCreateError(null);
                        }}
                    />
                </TabsContent>
            </Tabs>

            {/* "Want a different drill?" picker */}
            <Dialog
                open={pickerOpen}
                onOpenChange={(open) => {
                    if (!open && !creatingDrill) setPickerOpen(false);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Pick a different drill</DialogTitle>
                        <DialogDescription>
                            We&apos;ll generate a fresh 60-second drill in
                            this category and skip the current one.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Button
                            onClick={() => void handlePickCategory()}
                            disabled={creatingDrill}
                            className="w-full justify-center"
                            size="lg"
                        >
                            {selectedCategory === "__surprise__" &&
                            creatingDrill ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <ArrowRight className="h-4 w-4" />
                            )}
                            Surprise me
                        </Button>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {RECOMMENDED_SPEAKING_DRILL_CATEGORIES.map(
                                (category) => {
                                    const isSelected =
                                        selectedCategory === category;
                                    return (
                                        <button
                                            key={category}
                                            type="button"
                                            disabled={creatingDrill}
                                            className={cn(
                                                "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed",
                                                isSelected
                                                    ? "border-sky-300 bg-sky-50 dark:bg-sky-950/40"
                                                    : "border-border/60 hover:border-border hover:bg-muted/50 disabled:opacity-50",
                                            )}
                                            onClick={() =>
                                                void handlePickCategory(category)
                                            }
                                        >
                                            <div className="flex items-center gap-2">
                                                {isSelected ? (
                                                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                                                ) : null}
                                                <p className="text-sm font-medium">
                                                    {formatCategory(category)}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                },
                            )}
                        </div>
                        {createError ? (
                            <p
                                className="text-sm text-destructive"
                                role="alert"
                            >
                                {createError}
                            </p>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

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

function TodaysDrillHero({ session }: { session: SessionType }) {
    const isReplay = session.type === "scenario_replay";
    return (
        <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-8 shadow-sm">
            <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
            />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                        Today&apos;s drill is ready
                        {isReplay ? (
                            <>
                                <span className="mx-1.5 text-sky-700/50">
                                    &middot;
                                </span>
                                <span className="font-normal normal-case">
                                    from a real conversation
                                </span>
                            </>
                        ) : null}
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        {session.plan.scenario.title}
                    </h2>
                </div>
                <Link
                    href={drillHref(session)}
                    className={cn(
                        buttonVariants({ size: "lg" }),
                        "shrink-0",
                    )}
                >
                    <ArrowRight className="h-4 w-4" />
                    Start
                </Link>
            </div>
        </div>
    );
}

const DOWNLOAD_TIMESTAMP_KEY = "sayzo.desktop.downloadedAt";

function CapturesEmptyState() {
    const [os, setOs] = useState<OS>("windows");
    const [copied, setCopied] = useState(false);
    const isMobile = useIsMobile();
    const mobileDetectedRef = useRef(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOs(detectOS());
    }, []);

    useEffect(() => {
        if (!isMobile || mobileDetectedRef.current) return;
        mobileDetectedRef.current = true;
        track("mobile_visitor_detected", { page: "install_page" });
    }, [isMobile]);

    const handleDownloadClick = () => {
        track("desktop_download_clicked", {
            os,
            source: "landing_panel",
        });
        try {
            window.localStorage.setItem(
                DOWNLOAD_TIMESTAMP_KEY,
                String(Date.now()),
            );
        } catch {
            // localStorage may be unavailable — best effort only.
        }
    };

    const switchOS = () => {
        const next = otherOS(os);
        track("install_os_switched", { from: os, to: next });
        setOs(next);
        setCopied(false);
    };

    const handleCopy = async (command: string) => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            track("install_terminal_copied", { os });
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked — user can copy manually.
        }
    };

    const active = PLATFORMS[os];
    const other = PLATFORMS[otherOS(os)];
    const OSIcon = os === "macos" ? Apple : Monitor;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-8 shadow-sm">
            <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                        One-time setup
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                        Feedback on your real work calls
                    </h2>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        Install the Sayzo app and it joins your work calls.
                        After each one, you get feedback on how it went — plus
                        drills built from the moments worth practicing.
                    </p>

                    <ol className="mt-6 space-y-3">
                        <li className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                                1
                            </span>
                            <p className="pt-0.5 text-sm">
                                <span className="font-medium">
                                    Install Sayzo on your computer
                                </span>
                                <span className="text-muted-foreground">
                                    {" "}
                                    — takes under a minute.
                                </span>
                            </p>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                                2
                            </span>
                            <p className="pt-0.5 text-sm">
                                <span className="font-medium">
                                    Join your work calls
                                </span>
                                <span className="text-muted-foreground">
                                    {" "}
                                    — Sayzo saves them in the background.
                                </span>
                            </p>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                                3
                            </span>
                            <p className="pt-0.5 text-sm">
                                <span className="font-medium">
                                    Find your feedback and drills here
                                </span>
                                <span className="text-muted-foreground">
                                    {" "}
                                    — after every call.
                                </span>
                            </p>
                        </li>
                    </ol>
                </div>

                <div className="rounded-xl border border-sky-100 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
                    {isMobile ? (
                        <div className="flex flex-col gap-3">
                            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200/70">
                                <Smartphone className="size-3" />
                                You&apos;re on mobile — save this for your
                                computer
                            </div>
                            <SaveLinkActions
                                source="install_page"
                                layout="stacked"
                            />
                            <p className="text-xs text-muted-foreground">
                                Sayzo runs on Windows and macOS. Send yourself
                                the link and finish setup on your computer.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200/70">
                                <OSIcon className="size-3" />
                                Detected {active.label}
                            </div>

                            <a
                                href={active.downloadUrl}
                                download
                                onClick={handleDownloadClick}
                                className={cn(
                                    buttonVariants({ size: "lg" }),
                                    "mt-4 w-full justify-center bg-sky-600 text-white shadow-lg shadow-sky-600/25 ring-1 ring-inset ring-sky-400/30 transition-all hover:bg-sky-700 hover:shadow-xl hover:shadow-sky-600/30",
                                )}
                            >
                                <Download className="size-4" />
                                Download Sayzo for {active.label}
                            </a>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {active.fileName} · {active.minOS}
                            </p>

                            <button
                                type="button"
                                onClick={switchOS}
                                className="mt-3 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                            >
                                Need {other.label} instead?
                            </button>

                            <details className="group mt-4 border-t border-sky-100/80 pt-3">
                                <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                                    <Terminal className="size-3" />
                                    <span className="group-open:hidden">
                                        Prefer the terminal?
                                    </span>
                                    <span className="hidden group-open:inline">
                                        Hide terminal one-liner
                                    </span>
                                </summary>
                                <div className="mt-3">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                                        {active.shell}
                                    </p>
                                    <div className="flex items-stretch gap-2">
                                        <code className="flex-1 overflow-x-auto rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs leading-relaxed">
                                            {active.command}
                                        </code>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                void handleCopy(active.command)
                                            }
                                            aria-label={`Copy ${active.shell} command`}
                                        >
                                            {copied ? (
                                                <Check className="size-3.5" />
                                            ) : (
                                                <Copy className="size-3.5" />
                                            )}
                                            {copied ? "Copied" : "Copy"}
                                        </Button>
                                    </div>
                                </div>
                            </details>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function NoDrillReadyHero({ onPick }: { onPick: () => void }) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/40 p-8 shadow-sm">
            <div
                aria-hidden
                className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-sky-200/40 to-indigo-200/30 blur-3xl"
            />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                        Ready to practice?
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        Pick a drill to get started
                    </h2>
                    <p className="text-sm text-muted-foreground sm:text-base">
                        Sixty seconds, one specific output. We&apos;ll
                        generate the next one automatically when you finish.
                    </p>
                </div>
                <Button onClick={onPick} size="lg" className="shrink-0">
                    <ArrowRight className="h-4 w-4" />
                    Pick a drill
                </Button>
            </div>
        </div>
    );
}
