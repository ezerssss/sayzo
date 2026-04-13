"use client";

import { Loader2, Target, Trash2 } from "lucide-react";
import { useState } from "react";

import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { CaptureType } from "@/types/captures";

type Props = {
    captures: CaptureType[];
    loading: boolean;
    error: string | null;
    userLabel: string;
    onSignOut: () => void;
    onBackToDrills: () => void;
    onSelectCapture: (capture: CaptureType) => void;
    onDeleteCapture: (captureId: string) => Promise<void>;
};

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

export function ConversationsDashboard(props: Readonly<Props>) {
    const {
        captures,
        loading,
        error,
        userLabel,
        onSignOut,
        onBackToDrills,
        onSelectCapture,
        onDeleteCapture,
    } = props;

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<CaptureType | null>(
        null,
    );

    const handleDeleteClick = (e: React.MouseEvent, capture: CaptureType) => {
        e.stopPropagation();
        setDeleteError(null);
        setConfirmDelete(capture);
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        const id = confirmDelete.id!;
        setConfirmDelete(null);
        setDeletingId(id);
        try {
            await onDeleteCapture(id);
        } catch (err) {
            setDeleteError(
                err instanceof Error
                    ? err.message
                    : "Could not delete real conversation.",
            );
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Real Conversations
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Signed in as{" "}
                        <span className="font-medium text-foreground">
                            {userLabel}
                        </span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={onBackToDrills}>
                        <Target className="h-4 w-4" />
                        Drills
                    </Button>
                    <Button variant="outline" onClick={onSignOut}>
                        Sign out
                    </Button>
                </div>
            </div>

            {loading ? (
                <p className="mt-6 text-sm text-muted-foreground">
                    Loading your real conversations...
                </p>
            ) : error ? (
                <p className="mt-6 text-sm text-destructive">{error}</p>
            ) : captures.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-border/70 p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        No real conversations yet. The Eloquy desktop agent
                        will surface your real meetings and calls here once
                        it picks one up.
                    </p>
                </div>
            ) : (
                <div className="mt-6 space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                        Real conversations ({captures.length})
                    </h3>
                    {deleteError ? (
                        <p className="text-sm text-destructive" role="alert">
                            {deleteError}
                        </p>
                    ) : null}
                    <div className="space-y-1">
                        {captures.map((capture, idx) => {
                            const captureId = capture.id ?? `capture-${idx}`;
                            const isDeleting = deletingId === captureId;
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
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className={`w-full cursor-pointer p-3 text-left ${isDeleting ? "pointer-events-none" : ""}`}
                                        onClick={() =>
                                            onSelectCapture(capture)
                                        }
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                onSelectCapture(capture);
                                            }
                                        }}
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
                                                    title="Delete real conversation"
                                                    onClick={(e) =>
                                                        handleDeleteClick(
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
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <Dialog
                open={confirmDelete !== null}
                onOpenChange={(open) => {
                    if (!open) setConfirmDelete(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this real conversation?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete{" "}
                            <strong>
                                {confirmDelete?.serverTitle ??
                                    confirmDelete?.title}
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
                            onClick={() => setConfirmDelete(null)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
