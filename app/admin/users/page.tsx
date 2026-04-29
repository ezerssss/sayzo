"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Shield, Star } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";
import type { UserProfileType } from "@/types/user";

type AdminUserRow = Partial<UserProfileType> & {
    uid: string;
    email: string;
};

type ListResponse = {
    users: AdminUserRow[];
    nextCursor: string | null;
};

export default function AdminUsersPage() {
    const [rows, setRows] = useState<AdminUserRow[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    const load = useCallback(
        async (params: { cursor: string | null; query: string; append: boolean }) => {
            const setLoader = params.append ? setLoadingMore : setLoading;
            setLoader(true);
            setError(null);
            try {
                const search = new URLSearchParams();
                if (params.query) search.set("q", params.query);
                if (params.cursor) search.set("cursor", params.cursor);
                const data = await api
                    .get(`/api/admin/users?${search.toString()}`, {
                        timeout: 30_000,
                    })
                    .json<ListResponse>();
                setRows((prev) =>
                    params.append ? [...prev, ...data.users] : data.users,
                );
                setCursor(data.nextCursor);
            } catch (err) {
                setError(await getKyErrorMessage(err, "Could not load users."));
            } finally {
                setLoader(false);
            }
        },
        [],
    );

    useEffect(() => {
        void load({ cursor: null, query: searchTerm, append: false });
    }, [searchTerm, load]);

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchTerm(query.trim());
    };

    return (
        <div className="flex flex-1 flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">Users</h1>
                <p className="text-sm text-muted-foreground">
                    Search by email or uid. Empty search lists everyone, newest
                    first.
                </p>
            </header>

            <form
                onSubmit={onSearchSubmit}
                className="flex items-center gap-2"
            >
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="email@example.com or firebase uid"
                        className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-foreground/30"
                    />
                </div>
                <Button type="submit" size="sm" variant="outline">
                    Search
                </Button>
                {searchTerm ? (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            setQuery("");
                            setSearchTerm("");
                        }}
                    >
                        Clear
                    </Button>
                ) : null}
            </form>

            {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading users&hellip;
                </div>
            ) : (
                <DataTable
                    rows={rows}
                    rowKey={(r) => r.uid}
                    empty="No users found."
                    columns={[
                        {
                            key: "email",
                            header: "Email",
                            cell: (r) => (
                                <Link
                                    href={`/admin/users/${r.uid}`}
                                    className="font-medium text-foreground hover:underline"
                                >
                                    {r.email || (
                                        <span className="text-muted-foreground">
                                            (no email)
                                        </span>
                                    )}
                                </Link>
                            ),
                        },
                        {
                            key: "uid",
                            header: "UID",
                            cell: (r) => (
                                <code className="text-[11px] text-muted-foreground">
                                    {r.uid}
                                </code>
                            ),
                        },
                        {
                            key: "flags",
                            header: "Flags",
                            cell: (r) => (
                                <div className="flex flex-wrap gap-1">
                                    {r.isAdmin ? (
                                        <Badge tone="red">
                                            <Shield className="size-3" />
                                            admin
                                        </Badge>
                                    ) : null}
                                    {r.hasFullAccess ? (
                                        <Badge tone="amber">
                                            <Star className="size-3" />
                                            full access
                                        </Badge>
                                    ) : null}
                                    {r.onboardingComplete === false ? (
                                        <Badge tone="muted">onboarding</Badge>
                                    ) : null}
                                </div>
                            ),
                        },
                        {
                            key: "credits",
                            header: "Credits",
                            cell: (r) => (
                                <span className="text-xs">
                                    {r.creditsUsed ?? 0}
                                    {" / "}
                                    {r.creditsLimit ?? "—"}
                                </span>
                            ),
                        },
                        {
                            key: "createdAt",
                            header: "Created",
                            cell: (r) => (
                                <span className="text-xs text-muted-foreground">
                                    {formatDate(r.createdAt)}
                                </span>
                            ),
                        },
                    ]}
                />
            )}

            {!loading && cursor ? (
                <div className="flex justify-center">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingMore}
                        onClick={() => {
                            void load({
                                cursor,
                                query: searchTerm,
                                append: true,
                            });
                        }}
                    >
                        {loadingMore ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        Load more
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function Badge({
    children,
    tone,
}: {
    children: React.ReactNode;
    tone: "red" | "amber" | "muted";
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                tone === "red" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                tone === "amber" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                tone === "muted" &&
                    "border-border bg-muted text-muted-foreground",
            )}
        >
            {children}
        </span>
    );
}

function formatDate(value: string | undefined): string {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleDateString();
    } catch {
        return value;
    }
}
