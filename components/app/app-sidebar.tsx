"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, LogOut, Target, Waves } from "lucide-react";

import { Eyebrow } from "@/components/app/eyebrow";
import { SidebarNavItem } from "@/components/app/sidebar-nav-item";
import { CreditsIndicator } from "@/components/credits/credits-indicator";
import { useAllCaptures } from "@/hooks/use-all-captures";
import { useAuthUser } from "@/hooks/use-auth-user";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 7;

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
 */
export function AppSidebar() {
    const pathname = usePathname();
    const { user, signOut } = useAuthUser();
    const { captures } = useAllCaptures(user?.uid);

    const conversationsActive =
        pathname === "/app" || pathname.startsWith("/app/conversations");
    const focusActive = pathname === "/app/focus";
    const isEmpty = captures.length === 0;
    const recent = captures.slice(0, RECENT_LIMIT);

    return (
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex">
            {/* Brand */}
            <div className="border-b border-border/60 px-4 py-4">
                <Link
                    href="/app"
                    className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Image
                        src="/sayzo-logo.png"
                        alt=""
                        width={28}
                        height={28}
                        className="shrink-0 rounded-md"
                    />
                    <span className="text-base font-semibold tracking-tight">
                        Sayzo
                    </span>
                </Link>
            </div>

            {/* Nav + recent calls */}
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
                <nav className="flex flex-col gap-1">
                    <SidebarNavItem
                        href="/app"
                        icon={Waves}
                        label="Conversations"
                        active={conversationsActive}
                    />
                    <SidebarNavItem
                        href="/app/focus"
                        icon={Target}
                        label="Focus"
                        active={focusActive}
                    />
                </nav>

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
                            Your calls will show up here once Sayzo joins them.
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
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-1 border-t border-border/60 px-3 py-3">
                <div className="px-3 pb-1 empty:hidden">
                    <CreditsIndicator />
                </div>
                {isEmpty ? (
                    <Link
                        href="/install"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                        <Download className="size-4 shrink-0" />
                        Install Sayzo
                    </Link>
                ) : null}
                <button
                    type="button"
                    onClick={() => void signOut()}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                    <LogOut className="size-4 shrink-0" />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
