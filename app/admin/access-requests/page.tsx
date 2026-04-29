"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";

type AccessRequestRow = {
    id: string;
    uid?: string;
    email?: string;
    note?: string;
    status?: string;
    createdAt?: string;
    reviewedAt?: string;
    reviewedBy?: string;
};

const STATUS_TABS: Array<{ value: "pending" | "approved" | "denied"; label: string }> =
    [
        { value: "pending", label: "Pending" },
        { value: "approved", label: "Approved" },
        { value: "denied", label: "Denied" },
    ];

export default function AdminAccessRequestsPage() {
    const [status, setStatus] = useState<"pending" | "approved" | "denied">(
        "pending",
    );
    const [rows, setRows] = useState<AccessRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(
        async (s: "pending" | "approved" | "denied") => {
            setLoading(true);
            setError(null);
            try {
                const data = await api
                    .get(`/api/admin/access-requests?status=${s}`, {
                        timeout: 30_000,
                    })
                    .json<{ requests: AccessRequestRow[] }>();
                setRows(data.requests);
            } catch (err) {
                setError(
                    await getKyErrorMessage(err, "Could not load requests."),
                );
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        void load(status);
    }, [status, load]);

    const decide = async (id: string, action: "approve" | "deny") => {
        setBusyId(id);
        setError(null);
        try {
            await api.patch(`/api/admin/access-requests/${id}`, {
                json: { action },
                timeout: 30_000,
            });
            await load(status);
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Could not update request."),
            );
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-5">
            <header className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold tracking-tight">
                    Access requests
                </h1>
                <p className="text-sm text-muted-foreground">
                    Approve flips the user&apos;s{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        hasFullAccess
                    </code>{" "}
                    flag and stamps{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        accessGrantedAt
                    </code>
                    .
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
            ) : (
                <DataTable
                    rows={rows}
                    rowKey={(r) => r.id}
                    empty={`No ${status} requests.`}
                    columns={[
                        {
                            key: "user",
                            header: "User",
                            cell: (r) =>
                                r.uid ? (
                                    <Link
                                        href={`/admin/users/${r.uid}`}
                                        className="font-medium text-foreground hover:underline"
                                    >
                                        {r.email || r.uid}
                                    </Link>
                                ) : (
                                    <span className="text-muted-foreground">
                                        {r.email || "—"}
                                    </span>
                                ),
                        },
                        {
                            key: "note",
                            header: "Note",
                            cell: (r) => (
                                <p className="max-w-md whitespace-pre-wrap text-xs text-muted-foreground">
                                    {r.note?.trim() || "—"}
                                </p>
                            ),
                        },
                        {
                            key: "createdAt",
                            header: "Submitted",
                            cell: (r) => (
                                <span className="text-xs text-muted-foreground">
                                    {r.createdAt
                                        ? new Date(r.createdAt).toLocaleString()
                                        : "—"}
                                </span>
                            ),
                        },
                        {
                            key: "actions",
                            header: "",
                            cell: (r) =>
                                status === "pending" ? (
                                    <div className="flex justify-end gap-1.5">
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            disabled={busyId === r.id}
                                            onClick={() => {
                                                void decide(r.id, "deny");
                                            }}
                                        >
                                            Deny
                                        </Button>
                                        <Button
                                            size="xs"
                                            disabled={busyId === r.id}
                                            onClick={() => {
                                                void decide(r.id, "approve");
                                            }}
                                        >
                                            {busyId === r.id ? (
                                                <Loader2 className="size-3 animate-spin" />
                                            ) : null}
                                            Approve
                                        </Button>
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        {r.reviewedAt
                                            ? new Date(
                                                  r.reviewedAt,
                                              ).toLocaleString()
                                            : "—"}
                                    </span>
                                ),
                            className: "text-right",
                        },
                    ]}
                />
            )}
        </div>
    );
}
