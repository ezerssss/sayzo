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
                <h1 className="text-2xl font-semibold tracking-tight">
                    You&apos;re in
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
