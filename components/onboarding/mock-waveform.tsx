"use client";

import { cn } from "@/lib/utils";

const BAR_COUNT = 24;

interface PropsInterface {
    active?: boolean;
    className?: string;
}

export function MockWaveform(props: Readonly<PropsInterface>) {
    const { active = false, className } = props;

    return (
        <div
            className={cn(
                "flex h-14 items-end justify-center gap-0.5 rounded-xl border border-border/80 bg-muted/40 px-3 py-2",
                className,
            )}
            aria-hidden
        >
            {Array.from({ length: BAR_COUNT }, (_, i) => (
                <span
                    key={i}
                    className={cn(
                        "w-1 rounded-full bg-foreground/25 transition-all duration-300",
                        active && "animate-pulse bg-primary/80",
                    )}
                    style={{
                        height: `${12 + ((i * 17) % 55)}%`,
                        animationDelay: active ? `${i * 35}ms` : undefined,
                    }}
                />
            ))}
        </div>
    );
}
