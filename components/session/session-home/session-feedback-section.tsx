import { FileText, Sparkles } from "lucide-react";

import { MainIssueCard } from "@/components/coaching/main-issue-card";
import { TopFixesCard } from "@/components/coaching/top-fixes-card";
import { PostDrillInstallCard } from "@/components/install/post-drill-install-card";
import { DrillTranscriptView } from "@/components/session/drill-transcript-view";
import { FeedbackChat } from "@/components/session/feedback-chat";
import { ImprovedVersionView } from "@/components/session/improved-version-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CaptureTranscriptLine } from "@/types/captures";
import type {
    SessionAnalysisType,
    SessionFeedbackType,
} from "@/types/sessions";

type Props = {
    shouldShowResults: boolean;
    isSkipped: boolean;
    currentTranscript: string;
    currentServerTranscript?: CaptureTranscriptLine[] | null;
    currentAnalysis: SessionAnalysisType | null;
    currentFeedback: SessionFeedbackType | null;
    requiresRetry: boolean;
    completionReason: string | null;
    onSeekToSecond: (seconds: number) => void;
    sessionId?: string;
    uid?: string;
    /** For the install nudge: 0 means desktop helper not installed yet. */
    captureCount: number;
    firstDrillCompletedAt?: string | null;
    drillCreatedAt?: string | null;
};

function buildChatContext(
    analysis: SessionAnalysisType | null,
): string {
    if (!analysis) return "";
    const lines: string[] = [];
    if (analysis.mainIssue?.trim()) {
        lines.push(`# Main issue\n${analysis.mainIssue.trim()}`);
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
        captureCount,
        firstDrillCompletedAt,
        drillCreatedAt,
    } = props;

    if (!shouldShowResults) return null;

    if (isSkipped) {
        return (
            <div className="mt-6 space-y-4 rounded-xl border border-border/70 p-4">
                <div>
                    <p className="text-sm font-medium">Skipped drill</p>
                    <p className="mt-2 text-sm text-muted-foreground">
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
        <Tabs defaultValue="now" className="mt-6">
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                <TabsTrigger value="now" className="shrink-0">
                    <FileText className="size-3.5" />
                    Now
                </TabsTrigger>
                <TabsTrigger value="improved" className="shrink-0">
                    <Sparkles className="size-3.5" />
                    Improved Version
                </TabsTrigger>
            </TabsList>
            <TabsContent value="now" className="mt-3 space-y-4">
                {requiresRetry && completionReason ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                        <p className="text-sm font-medium">
                            This one needs a retry
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {completionReason}
                        </p>
                    </div>
                ) : null}
                {currentAnalysis?.mainIssue ? (
                    <MainIssueCard mainIssue={currentAnalysis.mainIssue} />
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">Main issue</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Waiting for analysis…
                        </p>
                    </div>
                )}
                {fixes.length > 0 ? (
                    <TopFixesCard moments={fixes} onSeek={onSeekToSecond} />
                ) : null}
                {currentTranscript ||
                (currentServerTranscript &&
                    currentServerTranscript.length > 0) ? (
                    <DrillTranscriptView
                        serverTranscript={currentServerTranscript}
                        transcript={currentTranscript}
                        fixTheseFirst={fixes}
                        onSeekToSecond={onSeekToSecond}
                    />
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">Transcript</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Waiting for transcription…
                        </p>
                    </div>
                )}
                {showChat && sessionId ? (
                    <FeedbackChat
                        source="session"
                        sourceId={sessionId}
                        sectionKey="now"
                        sectionTitle="Now"
                        feedbackContent={chatContext}
                        onSeekToSecond={onSeekToSecond}
                    />
                ) : null}
                <PostDrillInstallCard
                    captureCount={captureCount}
                    firstDrillCompletedAt={firstDrillCompletedAt}
                    drillCreatedAt={drillCreatedAt}
                />
            </TabsContent>
            <TabsContent value="improved" className="mt-3">
                {hasImprovedVersion && currentFeedback ? (
                    <ImprovedVersionView
                        content={currentFeedback.improvedVersion!}
                    />
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">
                            Improved Version
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Start a new drill to get an improved version of
                            your performance.
                        </p>
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
}
