"use client";

import { Sparkles } from "lucide-react";

import { FeedbackChat } from "@/components/session/feedback-chat";
import type { SessionAnalysisType } from "@/types/sessions";

type Props = {
    analysis: SessionAnalysisType;
    needsRetry?: boolean;
    completionReason?: string | null;
    sessionId?: string;
    uid?: string;
    onSeekToSecond?: (seconds: number) => void;
};

function overviewToText(analysis: SessionAnalysisType): string {
    const parts = [
        `**Overview:** ${analysis.overview}`,
        `**Main issue:** ${analysis.mainIssue}`,
    ];
    if (analysis.secondaryIssues.length > 0) {
        parts.push(
            `**Secondary issues:**\n${analysis.secondaryIssues
                .map((s) => `- ${s}`)
                .join("\n")}`,
        );
    }
    if (analysis.improvements.length > 0) {
        parts.push(
            `**Improvements:**\n${analysis.improvements
                .map((s) => `- ${s}`)
                .join("\n")}`,
        );
    }
    if (analysis.regressions.length > 0) {
        parts.push(
            `**Regressions:**\n${analysis.regressions
                .map((s) => `- ${s}`)
                .join("\n")}`,
        );
    }
    if (analysis.notes?.trim()) {
        parts.push(`**Notes:** ${analysis.notes.trim()}`);
    }
    return parts.join("\n\n");
}

export function DrillOverviewPanel(props: Readonly<Props>) {
    const {
        analysis,
        needsRetry,
        completionReason,
        sessionId,
        uid,
        onSeekToSecond,
    } = props;

    const chatEnabled = Boolean(sessionId && uid);
    const hasProgress =
        analysis.improvements.length > 0 || analysis.regressions.length > 0;

    return (
        <div className="space-y-4">
            {needsRetry && completionReason ? (
                <div className="rounded-xl border border-amber-400/60 bg-amber-50/30 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                        Retry needed
                    </p>
                    <p className="mt-1.5 text-sm text-amber-700">
                        {completionReason}
                    </p>
                </div>
            ) : null}

            {analysis.overview?.trim() ? (
                <div className="rounded-xl border border-border/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="size-4" />
                        Overview
                    </div>
                    <div className="mt-3 rounded-lg border border-border/50 bg-background/50 p-3">
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            {analysis.overview}
                        </p>
                    </div>
                    {chatEnabled ? (
                        <FeedbackChat
                            source="session"
                            sourceId={sessionId!}
                            sectionKey="overview"
                            sectionTitle="Overview"
                            feedbackContent={overviewToText(analysis)}
                            onSeekToSecond={onSeekToSecond}
                        />
                    ) : null}
                </div>
            ) : null}

            {analysis.mainIssue?.trim() ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                        Main issue
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-foreground">
                        {analysis.mainIssue}
                    </p>
                    {analysis.secondaryIssues.length > 0 ? (
                        <ul className="mt-3 space-y-1.5 border-t border-amber-200/60 pt-3">
                            {analysis.secondaryIssues.map((issue, i) => (
                                <li
                                    key={i}
                                    className="text-sm leading-relaxed text-muted-foreground"
                                >
                                    <span className="mr-1.5 text-amber-700/70">
                                        &bull;
                                    </span>
                                    {issue}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}

            {hasProgress ? (
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Progress
                    </p>
                    {analysis.improvements.length > 0 ? (
                        <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-emerald-700">
                                Improvements
                            </p>
                            {analysis.improvements.map((item, i) => (
                                <p
                                    key={i}
                                    className="text-sm leading-relaxed text-muted-foreground"
                                >
                                    <span className="text-emerald-600">+</span>{" "}
                                    {item}
                                </p>
                            ))}
                        </div>
                    ) : null}
                    {analysis.regressions.length > 0 ? (
                        <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-amber-700">
                                Regressions
                            </p>
                            {analysis.regressions.map((item, i) => (
                                <p
                                    key={i}
                                    className="text-sm leading-relaxed text-muted-foreground"
                                >
                                    <span className="text-amber-600">-</span>{" "}
                                    {item}
                                </p>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {analysis.notes?.trim() ? (
                <p className="px-1 text-xs italic leading-relaxed text-muted-foreground">
                    {analysis.notes}
                </p>
            ) : null}
        </div>
    );
}
