"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { api } from "@/lib/api-client";
import type { AdminAlert } from "@/schemas";

/**
 * Thin banner shown across the admin shell when there are open metric alerts.
 * The MVP notification surface (no email infra) — links into the Metrics page
 * where alerts can be acknowledged/resolved.
 */
export function AlertsBanner() {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await api
                    .get("/api/admin/alerts", {
                        searchParams: { status: "open" },
                        timeout: 20_000,
                    })
                    .json<{ alerts: AdminAlert[] }>();
                if (!cancelled) setCount(res.alerts.length);
            } catch {
                // Non-fatal — the banner just stays hidden.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (count === 0) return null;

    return (
        <Link
            href="/admin/metrics"
            className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-400"
        >
            <AlertTriangle className="size-4 shrink-0" />
            <span>
                {count} open metric {count === 1 ? "alert" : "alerts"} — review
                on the Metrics page.
            </span>
        </Link>
    );
}
