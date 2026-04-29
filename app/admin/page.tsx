"use client";

import Link from "next/link";
import {
    AlertCircle,
    BadgeCheck,
    History,
    LifeBuoy,
    Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const TILES: Array<{
    href: string;
    label: string;
    description: string;
    Icon: typeof Users;
}> = [
    {
        href: "/admin/users",
        label: "Users",
        description: "Search, view profile + data, edit credits, delete accounts.",
        Icon: Users,
    },
    {
        href: "/admin/access-requests",
        label: "Access requests",
        description: "Approve or deny full-access requests from users.",
        Icon: BadgeCheck,
    },
    {
        href: "/admin/support-reports",
        label: "Support reports",
        description: "Triage incoming bug reports and feedback.",
        Icon: LifeBuoy,
    },
    {
        href: "/admin/jobs",
        label: "Failed jobs",
        description: "Inspect failed sessions + captures and retry their pipelines.",
        Icon: AlertCircle,
    },
    {
        href: "/admin/audit",
        label: "Audit log",
        description: "Append-only record of every admin action taken.",
        Icon: History,
    },
];

export default function AdminOverviewPage() {
    return (
        <div className="flex flex-1 flex-col gap-6">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
                <p className="text-sm text-muted-foreground">
                    Operate Sayzo from one place. Every action is gated by the{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        isAdmin
                    </code>{" "}
                    flag on your user profile and recorded in the audit log.
                </p>
            </header>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {TILES.map(({ href, label, description, Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className={cn(
                            "group rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40",
                        )}
                    >
                        <div className="flex items-center gap-2 text-foreground">
                            <Icon className="size-4" />
                            <span className="text-sm font-semibold">{label}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            {description}
                        </p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
