"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    className?: string;
};

export function DataTable<T>({
    rows,
    columns,
    rowKey,
    empty,
    onRowClick,
    className,
}: {
    rows: T[];
    columns: DataTableColumn<T>[];
    rowKey: (row: T) => string;
    empty?: ReactNode;
    onRowClick?: (row: T) => void;
    className?: string;
}) {
    if (rows.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
                {empty ?? "Nothing to show."}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "overflow-x-auto rounded-xl border border-border bg-card",
                className,
            )}
        >
            <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={cn("px-4 py-2.5", col.className)}
                            >
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={rowKey(row)}
                            className={cn(
                                "border-b border-border last:border-b-0 transition-colors",
                                onRowClick &&
                                    "cursor-pointer hover:bg-muted/40",
                            )}
                            onClick={
                                onRowClick ? () => onRowClick(row) : undefined
                            }
                        >
                            {columns.map((col) => (
                                <td
                                    key={col.key}
                                    className={cn(
                                        "px-4 py-2.5 align-top",
                                        col.className,
                                    )}
                                >
                                    {col.cell(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
