"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

export function DangerZone({
    uid,
    email,
    isSelf,
    onDeleted,
}: {
    uid: string;
    email: string;
    isSelf: boolean;
    onDeleted: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const expected = email || uid;
    const canDelete = !isSelf && confirm.trim() === expected;

    const onDelete = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.delete(`/api/admin/users/${uid}`, { timeout: 120_000 });
            setOpen(false);
            onDeleted();
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not delete user."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <header className="mb-3">
                <h2 className="text-sm font-semibold text-destructive">
                    Danger zone
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Permanently delete this user account: Firebase Auth record,
                    profile, sessions, captures, focus insights, skill memory,
                    audit-flow tokens, and Storage objects. The audit log entry
                    survives the deletion.
                </p>
            </header>
            <Button
                variant="destructive"
                size="sm"
                disabled={isSelf}
                onClick={() => setOpen(true)}
            >
                <Trash2 className="size-3.5" />
                Delete user account
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Permanently delete user?</DialogTitle>
                        <DialogDescription>
                            This cannot be undone. To confirm, type{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                {expected}
                            </code>{" "}
                            below.
                        </DialogDescription>
                    </DialogHeader>
                    <input
                        type="text"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={expected}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-destructive/40"
                    />
                    {error ? (
                        <p className="text-xs text-destructive">{error}</p>
                    ) : null}
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpen(false)}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                                void onDelete();
                            }}
                            disabled={!canDelete || busy}
                        >
                            {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Trash2 className="size-3.5" />
                            )}
                            Delete forever
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {isSelf ? (
                <p className="mt-3 text-xs text-muted-foreground">
                    Refusing to delete your own admin account.
                </p>
            ) : null}
        </section>
    );
}
