import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CreditsIndicator } from "@/components/credits/credits-indicator";

export function SessionHomeHeader() {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                <Link
                    href="/app"
                    className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    My Drills
                </Link>
                <h1 className="text-2xl font-semibold tracking-tight">
                    Your drill
                </h1>
            </div>
            <CreditsIndicator />
        </div>
    );
}
