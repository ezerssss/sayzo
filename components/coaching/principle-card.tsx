import { Lightbulb } from "lucide-react";

import type { MainIssueShape } from "@/schemas";

type Props = {
    shape: MainIssueShape | null | undefined;
};

export function PrincipleCard({ shape }: Readonly<Props>) {
    if (!shape) return null;
    const principle = shape.principle?.trim();
    const shapeText = shape.shape?.trim();
    if (!principle && !shapeText) return null;

    return (
        <div className="rounded-2xl border border-sky-200/80 bg-sky-50/40 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-200/60 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    <Lightbulb className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-800/80 dark:text-sky-300/80">
                        Principle
                    </p>
                    {principle ? (
                        <p className="mt-1 text-base font-medium leading-snug text-foreground">
                            {principle}
                        </p>
                    ) : null}
                    {shapeText ? (
                        <div className="mt-3 border-t border-sky-200/60 pt-3 dark:border-sky-900/40">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-800/70 dark:text-sky-300/70">
                                Shape for this drill
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-foreground">
                                {shapeText}
                            </p>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
