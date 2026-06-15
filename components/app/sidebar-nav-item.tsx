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
 *
 * When the rail is `collapsed`, the label drops out and only the centered icon
 * shows — so the row carries its name via aria-label (accessible name) + title
 * (hover tooltip) instead of the now-absent text.
 */
export function SidebarNavItem({
    href,
    icon: Icon,
    label,
    active: activeProp,
    collapsed = false,
}: Readonly<{
    href: string;
    icon: LucideIcon;
    label: string;
    active?: boolean;
    collapsed?: boolean;
}>) {
    const pathname = usePathname();
    const active = activeProp ?? pathname === href;

    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            className={cn(
                "flex items-center rounded-lg text-sm transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                active
                    ? "bg-sky-50 font-medium text-sky-700"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
        >
            <Icon className="size-4 shrink-0" />
            {!collapsed ? <span className="truncate">{label}</span> : null}
        </Link>
    );
}
