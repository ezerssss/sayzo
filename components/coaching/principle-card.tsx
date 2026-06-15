import { Lightbulb } from "lucide-react";

import type { MainIssueShape } from "@/schemas";

type Props = {
    shape: MainIssueShape | null | undefined;
};

/** Card-less sky left-accent: the principle behind the main issue, plus the
 *  shape to aim for in this replay. */
export function PrincipleCard({ shape }: Readonly<Props>) {
    if (!shape) return null;
    const principle = shape.principle?.trim();
    const shapeText = shape.shape?.trim();
    if (!principle && !shapeText) return null;

    return (
        <div className="border-l-2 border-sky-300 pl-4">
            <div className="flex items-center gap-1.5">
                <Lightbulb className="size-3.5 shrink-0 text-sky-600" />
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sky-800/80">
                    Principle
                </p>
            </div>
            {principle ? (
                <p className="mt-1.5 text-base font-medium leading-snug text-foreground">
                    {principle}
                </p>
            ) : null}
            {shapeText ? (
                <div className="mt-3">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sky-800/70">
                        Shape for this replay
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                        {shapeText}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
