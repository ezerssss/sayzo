"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Target, Waves } from "lucide-react";

import { cn } from "@/lib/utils";

const TAB_ITEMS: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    match: (pathname: string) => boolean;
}[] = [
    {
        href: "/app",
        label: "Conversations",
        icon: Waves,
        match: (p) => p === "/app" || p.startsWith("/app/conversations"),
    },
    {
        href: "/app/focus",
        label: "Focus",
        icon: Target,
        match: (p) => p === "/app/focus",
    },
];

/**
 * Bottom navigation for mobile, where the sidebar rail is hidden. Route-based
 * (mirrors the sidebar's two primary destinations) so refresh / deep-links land
 * correctly and the active state stays honest.
 */
export function MobileTabBar() {
    const pathname = usePathname();

    return (
        <nav
            aria-label="Primary"
            className="flex shrink-0 items-stretch border-t border-border/60 bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
            {TAB_ITEMS.map(({ href, label, icon: Icon, match }) => {
                const active = match(pathname);
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                            active
                                ? "text-sky-700"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Icon className="size-5" />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
