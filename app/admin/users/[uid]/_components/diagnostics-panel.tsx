"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RadioTower, Trash2 } from "lucide-react";

import { DataTable } from "@/app/admin/_components/data-table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import type { DiagnosticLogType, UserProfileType } from "@/schemas";

type DiagnosticsListResponse = {
    logs: DiagnosticLogType[];
    nextCursor: string | null;
};

/**
 * Agent inventory readout + on-demand log pull + uploaded-logs browser for one
 * user. The inventory comes from the user-detail `profile` (last-seen agent
 * headers ingested by /api/me); the logs are fetched here.
 */
export function DiagnosticsPanel({
    uid,
    profile,
    onProfileChange,
}: {
    uid: string;
    profile: UserProfileType | null;
    onProfileChange: () => void | Promise<void>;
}) {
    const [logs, setLogs] = useState<DiagnosticLogType[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api
                .get(`/api/admin/users/${uid}/diagnostics?limit=25`, {
                    timeout: 30_000,
                })
                .json<DiagnosticsListResponse>();
            setLogs(data.logs);
        } catch (err) {
            setError(await getKyErrorMessage(err, "Could not load logs."));
        } finally {
            setLoading(false);
        }
    }, [uid]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    return (
        <section className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Agent &amp; diagnostics</h2>
                <span className="text-xs text-muted-foreground">Newest 25</span>
            </header>

            <div className="grid gap-4 p-4">
                <InventoryReadout profile={profile} />
                <CollectLogsToggle
                    uid={uid}
                    profile={profile}
                    onSaved={onProfileChange}
                />

                {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                ) : null}

                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading logs&hellip;
                    </div>
                ) : (
                    <DataTable
                        rows={logs}
                        rowKey={(l) => l.id ?? ""}
                        empty="No diagnostic logs uploaded by this user."
                        columns={[
                            {
                                key: "captured",
                                header: "Captured",
                                cell: (l) => (
                                    <span className="text-xs text-muted-foreground">
                                        {formatDateTime(l.capturedAt)}
                                    </span>
                                ),
                            },
                            {
                                key: "reason",
                                header: "Reason",
                                cell: (l) => <ReasonBadge reason={l.reason} />,
                            },
                            {
                                key: "version",
                                header: "Version",
                                cell: (l) => (
                                    <code className="text-[11px] text-muted-foreground">
                                        {l.version || "—"}
                                    </code>
                                ),
                            },
                            {
                                key: "size",
                                header: "Size",
                                cell: (l) => (
                                    <span className="text-xs">
                                        {formatBytes(l.totalSize)}
                                        <span className="text-muted-foreground">
                                            {" · "}
                                            {l.blobs?.length ?? 0} file
                                            {(l.blobs?.length ?? 0) === 1
                                                ? ""
                                                : "s"}
                                        </span>
                                    </span>
                                ),
                            },
                            {
                                key: "files",
                                header: "Files",
                                cell: (l) => <LogFiles log={l} />,
                            },
                            {
                                key: "actions",
                                header: "",
                                cell: (l) => (
                                    <DeleteLogButton
                                        log={l}
                                        onDeleted={loadLogs}
                                    />
                                ),
                            },
                        ]}
                    />
                )}
            </div>
        </section>
    );
}

function InventoryReadout({ profile }: { profile: UserProfileType | null }) {
    const rows: Array<[string, string]> = [
        ["Version", profile?.agentVersion || "—"],
        ["Platform", profile?.agentPlatform || "—"],
        ["Install ID", profile?.agentInstallId || "—"],
        [
            "Last seen",
            profile?.agentLastSeenAt
                ? formatDateTime(profile.agentLastSeenAt)
                : "—",
        ],
    ];
    return (
        <div className="grid gap-1.5 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-2">
            {rows.map(([label, value]) => (
                <div
                    key={label}
                    className="grid grid-cols-[72px_1fr] items-baseline gap-2"
                >
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {label}
                    </span>
                    <span className="break-all font-mono text-[11px] text-foreground">
                        {value}
                    </span>
                </div>
            ))}
        </div>
    );
}

function CollectLogsToggle({
    uid,
    profile,
    onSaved,
}: {
    uid: string;
    profile: UserProfileType | null;
    onSaved: () => void | Promise<void>;
}) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const collectLogs = profile?.collectLogs === true;

    const flip = async () => {
        setSaving(true);
        setError(null);
        try {
            await api.patch(`/api/admin/users/${uid}/collect-logs`, {
                json: { collectLogs: !collectLogs },
                timeout: 30_000,
            });
            await onSaved();
        } catch (err) {
            setError(
                await getKyErrorMessage(err, "Could not change the flag."),
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
            <RadioTower className="size-4 text-muted-foreground" />
            <div className="flex-1">
                <p className="text-sm font-medium">On-demand log pull</p>
                <p className="text-xs text-muted-foreground">
                    {collectLogs
                        ? "Armed — the agent uploads its log on its next poll (≤6h), then this clears itself."
                        : "Off — flip on to pull this user's current diagnostic log."}
                </p>
            </div>
            <span
                className={
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium " +
                    (collectLogs
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "border-border bg-muted text-muted-foreground")
                }
            >
                {collectLogs ? "armed" : "off"}
            </span>
            <Button
                size="sm"
                variant={collectLogs ? "destructive" : "outline"}
                onClick={flip}
                disabled={saving}
            >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {collectLogs ? "Disarm" : "Request log"}
            </Button>
            {error ? (
                <p className="w-full text-xs text-destructive">{error}</p>
            ) : null}
        </div>
    );
}

function LogFiles({ log }: { log: DiagnosticLogType }) {
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const download = async (index: number, filename: string) => {
        if (!log.id) return;
        setBusy(index);
        setError(null);
        try {
            const blob = await api
                .get(`/api/admin/diagnostics/${log.id}/download?blob=${index}`, {
                    timeout: 60_000,
                })
                .blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(await getKyErrorMessage(err, "Download failed."));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col gap-1">
            {(log.blobs ?? []).map((blob, index) => (
                <Button
                    key={blob.storageKey}
                    variant="ghost"
                    size="xs"
                    className="justify-start gap-1"
                    disabled={busy !== null}
                    onClick={() => void download(index, blob.filename)}
                >
                    {busy === index ? (
                        <Loader2 className="size-3 animate-spin" />
                    ) : (
                        <Download className="size-3" />
                    )}
                    <span className="font-mono text-[11px]">
                        {blob.filename}
                    </span>
                </Button>
            ))}
            {error ? (
                <span className="text-[11px] text-destructive">{error}</span>
            ) : null}
        </div>
    );
}

function DeleteLogButton({
    log,
    onDeleted,
}: {
    log: DiagnosticLogType;
    onDeleted: () => void | Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const remove = async () => {
        if (!log.id) return;
        if (
            !window.confirm(
                "Permanently delete this diagnostic log and its files? This honors a delete-on-request and cannot be undone.",
            )
        ) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api.delete(`/api/admin/diagnostics/${log.id}`, {
                timeout: 30_000,
            });
            await onDeleted();
        } catch (err) {
            setError(await getKyErrorMessage(err, "Delete failed."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                onClick={() => void remove()}
                aria-label="Delete log"
            >
                {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                ) : (
                    <Trash2 className="size-3.5 text-destructive" />
                )}
            </Button>
            {error ? (
                <span className="text-[11px] text-destructive">{error}</span>
            ) : null}
        </div>
    );
}

function ReasonBadge({ reason }: { reason: DiagnosticLogType["reason"] }) {
    const tone =
        reason === "crash"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : reason === "on_demand"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-border bg-muted text-muted-foreground";
    return (
        <span
            className={
                "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                tone
            }
        >
            {reason}
        </span>
    );
}

function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(
        units.length - 1,
        Math.floor(Math.log(bytes) / Math.log(1024)),
    );
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(value: string | undefined): string {
    if (!value) return "—";
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}
