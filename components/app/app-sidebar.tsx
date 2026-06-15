"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
    Download,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Target,
    Waves,
} from "lucide-react";

import { Eyebrow } from "@/components/app/eyebrow";
import { SidebarNavItem } from "@/components/app/sidebar-nav-item";
import { CreditsIndicator } from "@/components/credits/credits-indicator";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 7;
const COLLAPSE_KEY = "sayzo.app.sidebarCollapsed";

function shortWhen(iso: string): string {
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        const startOfDay = (x: Date) =>
            new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const diffDays = Math.round(
            (startOfDay(new Date()) - startOfDay(d)) / 86_400_000,
        );
        if (diffDays <= 0) return "Today";
        if (diffDays === 1) return "Yest";
        if (diffDays < 7)
            return d.toLocaleDateString("en-US", { weekday: "short" });
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });
    } catch {
        return "";
    }
}

/**
 * The persistent left rail — the spine of the master-detail shell. Kept QUIET
 * by design: neutral surface, muted text, no gradient. The sky accent appears
 * only on the active nav / recent item so "you are here" always reads clearly.
 * Recent calls are capped (the rail shows recent, never all — "View all" opens
 * the full list).
 *
 * Collapsible: a header toggle shrinks the rail to a w-16 icon-only spine
 * (labels, recent calls and the credits readout drop out; the surviving icons
 * keep their accessible names via aria-label/title). The collapsed state is
 * persisted in localStorage and read AFTER hydration (default expanded on SSR),
 * and the width transition is gated on `hydrated` so it never animates on first
 * paint. The toggle stays neutral/muted — no accent — to respect the quiet rail.
 */
export function AppSidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAuthUser();
    const { captures } = useAllCaptures(user?.uid);

    const [collapsed, setCollapsed] = useState(false);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        let stored = false;
        try {
            stored = window.localStorage.getItem(COLLAPSE_KEY) === "1";
        } catch {
            // Storage blocked (private mode) — start expanded, don't persist.
        }
        // Client-only read after hydration; SSR renders the expanded state.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (stored) setCollapsed(true);
        setHydrated(true);
    }, []);

    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
        } catch {
            // best-effort
        }
    };

    const conversationsActive =
        pathname === "/app" || pathname.startsWith("/app/conversations");
    const focusActive = pathname === "/app/focus";
    const isEmpty = captures.length === 0;
    const recent = captures.slice(0, RECENT_LIMIT);

    return (
        <aside
            className={cn(
                "hidden shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex",
                collapsed ? "w-16" : "w-72",
                hydrated && "transition-[width] duration-200 ease-in-out",
            )}
        >
            {/* Brand + collapse toggle */}
            <div
                className={cn(
                    "flex border-b border-border/60 py-4",
                    collapsed
                        ? "flex-col items-center gap-3 px-2"
                        : "items-center justify-between px-4",
                )}
            >
                <Link
                    href="/app"
                    aria-label={collapsed ? "Sayzo home" : undefined}
                    className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Image
                        src="/sayzo-logo.png"
                        alt=""
                        width={28}
                        height={28}
                        className="shrink-0 rounded-md"
                    />
                    {!collapsed ? (
                        <span className="text-base font-semibold tracking-tight">
                            Sayzo
                        </span>
                    ) : null}
                </Link>
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label={
                        collapsed ? "Expand sidebar" : "Collapse sidebar"
                    }
                    aria-expanded={!collapsed}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    {collapsed ? (
                        <PanelLeftOpen className="size-4" />
                    ) : (
                        <PanelLeftClose className="size-4" />
                    )}
                </button>
            </div>

            {/* Nav + recent calls */}
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4",
                    collapsed ? "px-2" : "px-3",
                )}
            >
                <nav className="flex flex-col gap-1">
                    <SidebarNavItem
                        href="/app"
                        icon={Waves}
                        label="Conversations"
                        active={conversationsActive}
                        collapsed={collapsed}
                    />
                    <SidebarNavItem
                        href="/app/focus"
                        icon={Target}
                        label="Focus"
                        active={focusActive}
                        collapsed={collapsed}
                    />
                </nav>

                {!collapsed ? (
                    <div className="flex min-h-0 flex-col gap-1">
                        <div className="flex items-center justify-between px-3">
                            <Eyebrow tone="muted">Recent calls</Eyebrow>
                            {!isEmpty ? (
                                <Link
                                    href="/app/conversations"
                                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    View all
                                </Link>
                            ) : null}
                        </div>

                        {isEmpty ? (
                            <p className="px-3 py-1.5 text-xs leading-relaxed text-muted-foreground/80">
                                Your calls will show up here once Sayzo joins
                                them.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-0.5">
                                {recent.map((capture, idx) => {
                                    const id = capture.id ?? `capture-${idx}`;
                                    const title =
                                        capture.serverTitle ?? capture.title;
                                    const active =
                                        pathname === `/app/conversations/${id}`;
                                    return (
                                        <Link
                                            key={id}
                                            href={`/app/conversations/${id}`}
                                            aria-current={
                                                active ? "page" : undefined
                                            }
                                            className={cn(
                                                "flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                                                active
                                                    ? "bg-sky-50 font-medium text-sky-700"
                                                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                            )}
                                        >
                                            <span className="truncate">
                                                {title}
                                            </span>
                                            <span
                                                className={cn(
                                                    "shrink-0 text-[11px] tabular-nums",
                                                    active
                                                        ? "text-sky-500"
                                                        : "text-muted-foreground/60",
                                                )}
                                            >
                                                {shortWhen(capture.startedAt)}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Footer */}
            <div
                className={cn(
                    "flex flex-col gap-1 border-t border-border/60 py-3",
                    collapsed ? "px-2" : "px-3",
                )}
            >
                {!collapsed ? (
                    <div className="px-3 pb-1 empty:hidden">
                        <CreditsIndicator />
                    </div>
                ) : null}
                {isEmpty ? (
                    <Link
                        href="/install"
                        aria-label={collapsed ? "Install Sayzo" : undefined}
                        title={collapsed ? "Install Sayzo" : undefined}
                        className={cn(
                            "flex items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                            collapsed
                                ? "justify-center px-2 py-2"
                                : "gap-3 px-3 py-2",
                        )}
                    >
                        <Download className="size-4 shrink-0" />
                        {!collapsed ? "Install Sayzo" : null}
                    </Link>
                ) : null}
                <button
                    type="button"
                    onClick={() => void signOut()}
                    aria-label={collapsed ? "Sign out" : undefined}
                    title={collapsed ? "Sign out" : undefined}
                    className={cn(
                        "flex items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                        collapsed
                            ? "justify-center px-2 py-2"
                            : "gap-3 px-3 py-2",
                    )}
                >
                    <LogOut className="size-4 shrink-0" />
                    {!collapsed ? "Sign out" : null}
                </button>
            </div>
        </aside>
    );
}
