"use client";

import { CREDIT_WARN_THRESHOLD } from "@/constants/credits";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useUserCredits } from "@/hooks/use-user-credits";
import { cn } from "@/lib/utils";

interface PropsInterface {
    className?: string;
}

export function CreditsIndicator({ className }: Readonly<PropsInterface>) {
    const { user } = useAuthUser();
    const { loading, hasFullAccess, remaining } = useUserCredits(user?.uid);

    if (loading || hasFullAccess || !user) return null;
    if (remaining > CREDIT_WARN_THRESHOLD || remaining <= 0) return null;

    const label =
        remaining === 1
            ? "1 free action left"
            : `${remaining} free actions left`;

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
                className,
            )}
            title="Request full access before you run out"
        >
            {label}
        </span>
    );
}
