"use client";

import Link from "next/link";
import { ArrowRight, Download, Loader2, Target, Trash2 } from "lucide-react";
import { useState } from "react";

import { CaptureStatusBadge } from "@/components/conversations/capture-status-badge";
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
import { useInstallDismissed } from "@/hooks/use-install-dismissed";
import { cn } from "@/lib/utils";
import type { CaptureType } from "@/types/captures";

type Props = {
    captures: CaptureType[];
    loading: boolean;
    error: string | null;
    userLabel: string;
    onSignOut: () => void;
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
        onDeleteCapture,
    } = props;

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<CaptureType | null>(
        null,
    );
    const { dismissed: installDismissed, dismiss: dismissInstall } =
        useInstallDismissed();

    const handleDeleteClick = (e: React.MouseEvent, capture: CaptureType) => {
        e.stopPropagation();
        e.preventDefault();
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
                        href="/app"
                        className={cn(buttonVariants({ variant: "outline" }))}
                    >
                        <Target className="h-4 w-4" />
                        Drills
                    </Link>
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
                <div className="mt-6 space-y-4">
                    {installDismissed === false ? (
                        <InstallPanel
                            headline="Nothing here yet — install the companion to fill this up"
                            subhead="The desktop companion runs quietly on your machine and surfaces the moments worth coaching on. One command to install."
                            onDismiss={dismissInstall}
                            showViewAllLink
                        />
                    ) : (
                        <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
                            <p className="text-sm text-muted-foreground">
                                Nothing here yet. Once the Sayzo companion is
                                running on your machine, the moments worth
                                coaching on will show up here — ready to
                                review, or to replay as a drill.
                            </p>
                            {installDismissed === true ? (
                                <Link
                                    href="/install"
                                    className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    View install commands
                                    <ArrowRight className="size-3" />
                                </Link>
                            ) : null}
                        </div>
                    )}
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
                                    </Link>
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
