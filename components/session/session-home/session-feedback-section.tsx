import { AlertTriangle, Info } from "lucide-react";

import { Kicker, StaggerItem } from "@/components/coaching/briefing";
import { CalloutCard } from "@/components/coaching/callout-card";
import { FeedbackTabs } from "@/components/coaching/feedback-tabs";
import { ReactionBar } from "@/components/coaching/reaction-bar";
import { PrincipleCard } from "@/components/coaching/principle-card";
import { TopFixesCard } from "@/components/coaching/top-fixes-card";
import { DrillTranscriptView } from "@/components/session/drill-transcript-view";
import { FeedbackChat } from "@/components/session/feedback-chat";
import { ImprovedVersionView } from "@/components/session/improved-version-view";
import type { CaptureTranscriptLine } from "@/schemas";
import type { ItemAnalysis, SessionFeedbackType } from "@/schemas";

/** Matches the sentinel written by app/api/sessions/retry/route.ts. */
const VOLUNTARY_RETRY_REASON = "voluntary_retry";

type Props = {
    shouldShowResults: boolean;
    isSkipped: boolean;
    currentTranscript: string;
    currentServerTranscript?: CaptureTranscriptLine[] | null;
    currentAnalysis: ItemAnalysis | null;
    currentFeedback: SessionFeedbackType | null;
    requiresRetry: boolean;
    completionReason: string | null;
    onSeekToSecond: (seconds: number) => void;
    sessionId?: string;
    uid?: string;
};

function buildChatContext(analysis: ItemAnalysis | null): string {
    if (!analysis) return "";
    const lines: string[] = [];
    if (analysis.whatWentWell?.trim()) {
        lines.push(`# What went well\n${analysis.whatWentWell.trim()}`);
    }
    if (analysis.mainIssue?.trim()) {
        lines.push(`# Main issue\n${analysis.mainIssue.trim()}`);
    }
    if (analysis.mainIssueShape) {
        const principle = analysis.mainIssueShape.principle?.trim();
        const shape = analysis.mainIssueShape.shape?.trim();
        if (principle || shape) {
            const parts: string[] = ["# Principle"];
            if (principle) parts.push(principle);
            if (shape) parts.push(`Shape for this replay: ${shape}`);
            lines.push(parts.join("\n"));
        }
    }
    const top = analysis.fixTheseFirst?.slice(0, 2) ?? [];
    if (top.length > 0) {
        lines.push("# Fix these first");
        top.forEach((m, i) => {
            lines.push(`\n## Fix ${i + 1}`);
            if (m.anchor?.trim()) lines.push(`Anchor: ${m.anchor.trim()}`);
            if (m.betterOption?.trim())
                lines.push(`Try instead: ${m.betterOption.trim()}`);
            if (m.whyThisMatters?.trim())
                lines.push(`Why this matters: ${m.whyThisMatters.trim()}`);
        });
    }
    return lines.join("\n");
}

export function SessionFeedbackSection(props: Readonly<Props>) {
    const {
        shouldShowResults,
        isSkipped,
        currentTranscript,
        currentServerTranscript,
        currentAnalysis,
        currentFeedback,
        requiresRetry,
        completionReason,
        onSeekToSecond,
        sessionId,
        uid,
    } = props;

    if (!shouldShowResults) return null;

    if (isSkipped) {
        return (
            <div className="mt-6 space-y-4">
                <div>
                    <Kicker tone="muted">Skipped replay</Kicker>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        No coaching was generated for this one.
                    </p>
                </div>
                {currentTranscript ? (
                    <DrillTranscriptView
                        serverTranscript={currentServerTranscript}
                        transcript={currentTranscript}
                        fixTheseFirst={null}
                        onSeekToSecond={onSeekToSecond}
                        heading="What you said"
                    />
                ) : null}
            </div>
        );
    }

    const hasImprovedVersion = Boolean(
        currentFeedback?.improvedVersion?.trim(),
    );
    const fixes = currentAnalysis?.fixTheseFirst ?? [];
    const chatContext = buildChatContext(currentAnalysis);
    const showChat = Boolean(
        sessionId && uid && currentAnalysis && chatContext.trim(),
    );

    return (
        <div className="mt-6 space-y-4">
            {requiresRetry && completionReason === VOLUNTARY_RETRY_REASON ? (
                <div className="border-l-2 border-sky-300 pl-4">
                    <div className="flex items-center gap-1.5">
                        <Info className="size-3.5 shrink-0 text-sky-600" />
                        <Kicker tone="sky">Re-recording this replay</Kicker>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        Listen to your previous take below, then tap Try again
                        when you&apos;re ready.
                    </p>
                </div>
            ) : requiresRetry && completionReason ? (
                <div className="border-l-2 border-amber-300 pl-4">
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                        <Kicker tone="amber">This one needs a retry</Kicker>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {completionReason}
                    </p>
                </div>
            ) : null}
            <FeedbackTabs
                now={
                    <>
                        {currentAnalysis?.whatWentWell ? (
                            <StaggerItem order={0}>
                                <CalloutCard
                                    tone="positive"
                                    label="What went well"
                                    body={currentAnalysis.whatWentWell}
                                />
                            </StaggerItem>
                        ) : null}
                        {currentAnalysis?.mainIssue ? (
                            <StaggerItem order={1}>
                                <CalloutCard
                                    tone="warning"
                                    label="Main issue"
                                    body={currentAnalysis.mainIssue}
                                />
                            </StaggerItem>
                        ) : (
                            <div>
                                <Kicker tone="muted">Main issue</Kicker>
                                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                    Waiting for analysis…
                                </p>
                            </div>
                        )}
                        {currentAnalysis?.mainIssueShape ? (
                            <StaggerItem order={2}>
                                <PrincipleCard
                                    shape={currentAnalysis.mainIssueShape}
                                />
                            </StaggerItem>
                        ) : null}
                        {fixes.length > 0 ? (
                            <StaggerItem order={3}>
                                <TopFixesCard
                                    moments={fixes}
                                    onSeek={onSeekToSecond}
                                />
                            </StaggerItem>
                        ) : null}
                        {showChat && sessionId ? (
                            <StaggerItem order={4}>
                                <FeedbackChat
                                    source="session"
                                    sourceId={sessionId}
                                    sectionKey="now"
                                    sectionTitle="Coaching"
                                    feedbackContent={chatContext}
                                    onSeekToSecond={onSeekToSecond}
                                />
                            </StaggerItem>
                        ) : null}
                        {sessionId ? (
                            <StaggerItem order={5}>
                                <ReactionBar
                                    source="session"
                                    itemId={sessionId}
                                />
                            </StaggerItem>
                        ) : null}
                        {currentTranscript ||
                        (currentServerTranscript &&
                            currentServerTranscript.length > 0) ? (
                            <StaggerItem order={6}>
                                <DrillTranscriptView
                                    serverTranscript={currentServerTranscript}
                                    transcript={currentTranscript}
                                    fixTheseFirst={fixes}
                                    onSeekToSecond={onSeekToSecond}
                                />
                            </StaggerItem>
                        ) : (
                            <div>
                                <Kicker tone="muted">Transcript</Kicker>
                                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                    Waiting for transcription…
                                </p>
                            </div>
                        )}
                    </>
                }
                improved={
                    <>
                        <StaggerItem order={0}>
                            <ImprovedVersionView
                                content={currentFeedback?.improvedVersion ?? ""}
                            />
                        </StaggerItem>
                        {hasImprovedVersion &&
                        sessionId &&
                        uid &&
                        currentFeedback?.improvedVersion ? (
                            <StaggerItem order={1}>
                                <FeedbackChat
                                    source="session"
                                    sourceId={sessionId}
                                    sectionKey="rewrites"
                                    sectionTitle="Improved version"
                                    feedbackContent={
                                        currentFeedback.improvedVersion
                                    }
                                    onSeekToSecond={onSeekToSecond}
                                />
                            </StaggerItem>
                        ) : null}
                    </>
                }
            />
        </div>
    );
}
