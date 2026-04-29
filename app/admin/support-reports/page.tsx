"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";
import type { SupportReportStatus, SupportReportType } from "@/types/support";

type Report = SupportReportType & { id: string };

const STATUS_TABS: Array<{ value: SupportReportStatus; label: string }> = [
    { value: "open", label: "Open" },
    { value: "triaged", label: "Triaged" },
    { value: "closed", label: "Closed" },
];

export default function AdminSupportReportsPage() {
    const [status, setStatus] = useState<SupportReportStatus>("open");
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async (s: SupportReportStatus) => {
        setLoading(true);
        setError(null);
        try {
            const data = await api
                .get(`/api/admin/support-reports?status=${s}`, {
                    timeout: 30_000,
                })
                .json<{ reports: Report[] }>();
            setReports(data.reports);
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not load reports."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(status);
    }, [status, load]);

    const transition = async (id: string, next: SupportReportStatus) => {
        setBusyId(id);
        setError(null);
        try {
            await api.patch(`/api/admin/support-reports/${id}`, {
                json: { status: next },
                timeout: 30_000,
            });
            await load(status);
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not update report."));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Support reports
                </h1>
                <p className="text-sm text-muted-foreground">
                    Triage incoming reports. Click a row to see diagnostics.
                </p>
            </header>

            <div className="flex gap-2">
                {STATUS_TABS.map((tab) => (
                    <Button
                        key={tab.value}
                        variant={status === tab.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatus(tab.value)}
                    >
                        {tab.label}
                    </Button>
                ))}
            </div>

            {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            ) : null}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading&hellip;
                </div>
            ) : reports.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
                    No {status} reports.
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {reports.map((r) => {
                        const isOpen = expandedId === r.id;
                        return (
                            <div
                                key={r.id}
                                className="rounded-xl border border-border bg-card"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExpandedId(isOpen ? null : r.id)
                                    }
                                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30"
                                >
                                    <ChevronRight
                                        className={cn(
                                            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                                            isOpen && "rotate-90",
                                        )}
                                    />
                                    <div className="flex flex-1 flex-col gap-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-medium">
                                                {r.subject}
                                            </span>
                                            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {r.category}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {r.email}
                                            {" • "}
                                            {r.createdAt
                                                ? new Date(
                                                      r.createdAt,
                                                  ).toLocaleString()
                                                : "—"}
                                        </p>
                                    </div>
                                </button>
                                {isOpen ? (
                                    <div className="space-y-3 border-t border-border px-4 py-4">
                                        <pre className="whitespace-pre-wrap text-xs text-foreground">
                                            {r.message}
                                        </pre>
                                        <div className="grid gap-1 text-[11px] text-muted-foreground">
                                            <p>
                                                <span className="text-foreground">
                                                    User:
                                                </span>{" "}
                                                {r.uid ? (
                                                    <Link
                                                        href={`/admin/users/${r.uid}`}
                                                        className="hover:underline"
                                                    >
                                                        {r.uid}
                                                    </Link>
                                                ) : (
                                                    "anonymous"
                                                )}
                                            </p>
                                            {r.agentVersion ? (
                                                <p>
                                                    <span className="text-foreground">
                                                        Agent:
                                                    </span>{" "}
                                                    {r.agentVersion} on{" "}
                                                    {r.agentOs ?? "—"}
                                                </p>
                                            ) : null}
                                            {r.ip ? (
                                                <p>
                                                    <span className="text-foreground">
                                                        IP:
                                                    </span>{" "}
                                                    {r.ip}
                                                </p>
                                            ) : null}
                                            {r.userAgent ? (
                                                <p>
                                                    <span className="text-foreground">
                                                        UA:
                                                    </span>{" "}
                                                    <code className="text-[10px]">
                                                        {r.userAgent}
                                                    </code>
                                                </p>
                                            ) : null}
                                        </div>
                                        {r.diagnostics ? (
                                            <details className="rounded-lg border border-border bg-background p-2 text-xs">
                                                <summary className="cursor-pointer text-muted-foreground">
                                                    Diagnostics
                                                </summary>
                                                <pre className="mt-2 whitespace-pre-wrap text-[11px]">
                                                    {r.diagnostics}
                                                </pre>
                                            </details>
                                        ) : null}
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {STATUS_TABS.filter(
                                                (t) => t.value !== r.status,
                                            ).map((t) => (
                                                <Button
                                                    key={t.value}
                                                    size="xs"
                                                    variant="outline"
                                                    disabled={busyId === r.id}
                                                    onClick={() => {
                                                        void transition(
                                                            r.id,
                                                            t.value,
                                                        );
                                                    }}
                                                >
                                                    Move to {t.label}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
