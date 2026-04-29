"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";
import {
    AlertCircle,
    BadgeCheck,
    History,
    LayoutDashboard,
    LifeBuoy,
    Loader2,
    LogOut,
    Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";

const NAV_ITEMS: Array<{ href: string; label: string; Icon: typeof Users }> = [
    { href: "/admin", label: "Overview", Icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", Icon: Users },
    { href: "/admin/access-requests", label: "Access requests", Icon: BadgeCheck },
    { href: "/admin/support-reports", label: "Support reports", Icon: LifeBuoy },
    { href: "/admin/jobs", label: "Failed jobs", Icon: AlertCircle },
    { href: "/admin/audit", label: "Audit log", Icon: History },
];

export function AdminShell({ children }: { children: ReactNode }) {
    const { user, loading: authLoading, signOut } = useAuthUser();
    const { isAdmin, loading: adminLoading } = useIsAdmin(user?.uid);
    const router = useRouter();
    const pathname = usePathname();

    const ready = !authLoading && !adminLoading;

    useEffect(() => {
        if (!ready) return;
        if (!user) {
            router.replace("/login");
            return;
        }
        if (isAdmin === false) {
            router.replace("/app");
        }
    }, [ready, user, isAdmin, router]);

    if (!ready || !user || isAdmin !== true) {
        return (
            <div className="flex flex-1 items-center justify-center p-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    <span>Checking admin access&hellip;</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen w-full">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/40 md:flex">
                <div className="px-5 py-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Sayzo
                    </p>
                    <p className="mt-1 text-base font-semibold">Admin</p>
                </div>
                <nav className="flex flex-1 flex-col gap-1 px-3">
                    {NAV_ITEMS.map(({ href, label, Icon }) => {
                        const active =
                            href === "/admin"
                                ? pathname === "/admin"
                                : pathname.startsWith(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={cn(
                                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                                    active
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                )}
                            >
                                <Icon className="size-4" />
                                <span>{label}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t border-border px-3 py-3">
                    <div className="px-2 pb-2 text-xs text-muted-foreground">
                        <p className="truncate">{user.email}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                            void signOut();
                        }}
                    >
                        <LogOut className="size-3.5" />
                        Sign out
                    </Button>
                </div>
            </aside>
            <div className="flex min-h-screen flex-1 flex-col">
                <header className="flex items-center justify-between border-b border-border px-6 py-3 md:hidden">
                    <p className="text-sm font-semibold">Sayzo Admin</p>
                    <span className="text-xs text-muted-foreground">
                        {user.email}
                    </span>
                </header>
                <div className="flex flex-1 flex-col p-6">{children}</div>
            </div>
        </div>
    );
}
