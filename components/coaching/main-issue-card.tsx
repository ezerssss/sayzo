import { AlertTriangle } from "lucide-react";

type Props = {
    /** One short sentence — the single biggest thing to address. */
    mainIssue: string;
};

export function MainIssueCard({ mainIssue }: Readonly<Props>) {
    const trimmed = mainIssue?.trim();
    if (!trimmed) return null;
    return (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-200/60 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <AlertTriangle className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80 dark:text-amber-300/80">
                        Main issue
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {trimmed}
                    </p>
                </div>
            </div>
        </div>
    );
}
