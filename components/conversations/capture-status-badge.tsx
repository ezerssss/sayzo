"use client";

import {
    AlertCircle,
    CheckCircle,
    Loader2,
    XCircle,
} from "lucide-react";

import type { CaptureStatus } from "@/types/captures";

type Props = {
    status: CaptureStatus;
    rejectionReason?: string | null;
    error?: string | null;
};

export function CaptureStatusBadge(props: Readonly<Props>) {
    const { status, rejectionReason, error } = props;

    if (status === "analyzed") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle className="h-3 w-3" />
                Ready
            </span>
        );
    }

    if (status === "rejected") {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                title={rejectionReason ?? "Filtered out by the system"}
            >
                <XCircle className="h-3 w-3" />
                Filtered out
            </span>
        );
    }

    if (status.endsWith("_failed")) {
        return (
            <span
                className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                title={error ?? "Processing failed"}
            >
                <AlertCircle className="h-3 w-3" />
                Error
            </span>
        );
    }

    // In-flight: queued, transcribing, transcribed, validating, validated, analyzing, profiling
    const stageLabels: Partial<Record<CaptureStatus, string>> = {
        queued: "Waiting in queue",
        transcribing: "Transcribing audio",
        transcribed: "Transcription complete",
        validating: "Checking relevance",
        validated: "Starting analysis",
        analyzing: "Running deep analysis",
        profiling: "Updating your profile",
    };

    return (
        <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
            title={stageLabels[status] ?? "Processing"}
        >
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
        </span>
    );
}
