"use client";

import { Lock } from "lucide-react";

import { useCreditGate } from "@/components/credits/credit-gate-provider";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserCredits } from "@/hooks/use-user-credits";

/**
 * Subtle contextual banner rendered at the top of main content areas when the
 * user is out of credits. Complements the per-button lock state so users see
 * WHY their actions are disabled and have a clear next step.
 */
export function CreditsBanner() {
    const { user } = useAuthUser();
    const { loading, hasFullAccess, remaining, requestedAt, grantedAt } =
        useUserCredits(user?.uid);
    const creditGate = useCreditGate();

    if (loading || hasFullAccess || !user) return null;
    if (remaining > 0) return null;

    const alreadyRequested = Boolean(requestedAt && !grantedAt);

    return (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <div className="flex items-start gap-2.5 text-sm">
                <Lock className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                        {alreadyRequested
                            ? "Full access request received"
                            : "You're out of Sayzo credits"}
                    </p>
                    <p className="text-muted-foreground">
                        {alreadyRequested
                            ? "We'll email you once your account is unlocked."
                            : "New drills and practice sessions are paused until you have access."}
                    </p>
                </div>
            </div>
            {!alreadyRequested ? (
                <Button
                    size="sm"
                    onClick={() => creditGate.openLimitDialog()}
                >
                    Request access
                </Button>
            ) : null}
        </div>
    );
}
