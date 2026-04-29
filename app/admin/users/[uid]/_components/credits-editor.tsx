"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { UserProfileType } from "@/types/user";

export function CreditsEditor({
    uid,
    profile,
    onSaved,
}: {
    uid: string;
    profile: UserProfileType | null;
    onSaved: () => void | Promise<void>;
}) {
    const [creditsUsed, setCreditsUsed] = useState(
        String(profile?.creditsUsed ?? 0),
    );
    const [creditsLimit, setCreditsLimit] = useState(
        String(profile?.creditsLimit ?? ""),
    );
    const [hasFullAccess, setHasFullAccess] = useState(
        profile?.hasFullAccess === true,
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                hasFullAccess,
            };
            const usedNum = Number(creditsUsed);
            if (Number.isFinite(usedNum)) payload.creditsUsed = usedNum;
            if (creditsLimit.trim() !== "") {
                const limitNum = Number(creditsLimit);
                if (Number.isFinite(limitNum)) payload.creditsLimit = limitNum;
            }
            await api.patch(`/api/admin/users/${uid}/credits`, {
                json: payload,
                timeout: 30_000,
            });
            await onSaved();
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not save credits."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-xl border border-border bg-card p-4">
            <header className="mb-3">
                <h2 className="text-sm font-semibold">Credits & access</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Adjust the free-credit counters or grant full access.
                </p>
            </header>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Used">
                        <input
                            type="number"
                            min={0}
                            value={creditsUsed}
                            onChange={(e) => setCreditsUsed(e.target.value)}
                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                        />
                    </Field>
                    <Field label="Limit">
                        <input
                            type="number"
                            min={0}
                            value={creditsLimit}
                            onChange={(e) => setCreditsLimit(e.target.value)}
                            placeholder="default"
                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-foreground/30"
                        />
                    </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={hasFullAccess}
                        onChange={(e) => setHasFullAccess(e.target.checked)}
                        className="size-4 rounded border-border"
                    />
                    Has full access (bypasses credit limit)
                </label>
                {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                ) : null}
                <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={saving}>
                        {saving ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        Save
                    </Button>
                </div>
            </form>
        </section>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {label}
            {children}
        </label>
    );
}
