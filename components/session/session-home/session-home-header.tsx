import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
    userLabel: string;
    onSignOut: () => void;
    onBackToDashboard?: () => void;
};

export function SessionHomeHeader(props: Readonly<Props>) {
    const { userLabel, onSignOut, onBackToDashboard } = props;
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
                {onBackToDashboard ? (
                    <button
                        type="button"
                        className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        onClick={onBackToDashboard}
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        My Drills
                    </button>
                ) : null}
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
            <Button variant="outline" onClick={onSignOut}>
                Sign out
            </Button>
        </div>
    );
}
