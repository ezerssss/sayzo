"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A primary navigation row in the app sidebar. Active state is the ONLY place
 * the sky accent appears in the rail (the rest of the rail stays neutral), so
 * the accent always means "you are here". Pass `active` to override the default
 * exact-path match (e.g. Conversations stays active across /app/conversations*).
 */
export function SidebarNavItem({
    href,
    icon: Icon,
    label,
    active: activeProp,
}: Readonly<{
    href: string;
    icon: LucideIcon;
    label: string;
    active?: boolean;
}>) {
    const pathname = usePathname();
    const active = activeProp ?? pathname === href;

    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                    ? "bg-sky-50 font-medium text-sky-700"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
        >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
        </Link>
    );
}
