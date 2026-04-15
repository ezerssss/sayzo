import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CreditsIndicator } from "@/components/credits/credits-indicator";
import { Button } from "@/components/ui/button";

type Props = {
    userLabel: string;
    onSignOut: () => void;
};

export function SessionHomeHeader(props: Readonly<Props>) {
    const { userLabel, onSignOut } = props;
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
                <p className="text-sm text-muted-foreground">
                    Signed in as{" "}
                    <span className="font-medium text-foreground">
                        {userLabel}
                    </span>
                </p>
            </div>
            <div className="flex items-center gap-2">
                <CreditsIndicator />
                <Button variant="outline" onClick={onSignOut}>
                    Sign out
                </Button>
            </div>
        </div>
    );
}
