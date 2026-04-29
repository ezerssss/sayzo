"use client";

import { useState } from "react";
import { Loader2, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { UserProfileType } from "@/types/user";

export function AdminToggle({
    uid,
    profile,
    isSelf,
    onSaved,
}: {
    uid: string;
    profile: UserProfileType | null;
    isSelf: boolean;
    onSaved: () => void | Promise<void>;
}) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isAdmin = profile?.isAdmin === true;

    const flip = async () => {
        if (isSelf) return;
        setSaving(true);
        setError(null);
        try {
            await api.patch(`/api/admin/users/${uid}/admin`, {
                json: { isAdmin: !isAdmin },
                timeout: 30_000,
            });
            await onSaved();
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Could not change admin status."),
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-xl border border-border bg-card p-4">
            <header className="mb-3">
                <h2 className="text-sm font-semibold">Admin role</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Promotes or demotes this user. You cannot change your own
                    admin status — ask another admin.
                </p>
            </header>
            <div className="flex items-center gap-3">
                <span
                    className={
                        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium " +
                        (isAdmin
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-border bg-muted text-muted-foreground")
                    }
                >
                    <Shield className="size-3" />
                    {isAdmin ? "admin" : "not admin"}
                </span>
                <Button
                    size="sm"
                    variant={isAdmin ? "destructive" : "outline"}
                    onClick={flip}
                    disabled={saving || isSelf}
                >
                    {saving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : null}
                    {isAdmin ? "Demote" : "Promote to admin"}
                </Button>
            </div>
            {isSelf ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    Editing your own row — admin toggle is disabled.
                </p>
            ) : null}
            {error ? (
                <p className="mt-2 text-xs text-destructive">{error}</p>
            ) : null}
        </section>
    );
}
