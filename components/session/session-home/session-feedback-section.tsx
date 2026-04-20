import { FileText, Lightbulb, Sparkles } from "lucide-react";

import { CoachingMomentsView } from "@/components/session/coaching-moments-view";
import { DrillOverviewPanel } from "@/components/session/drill-overview-panel";
import { DrillTranscriptView } from "@/components/session/drill-transcript-view";
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
    hasMainOverview: boolean;
    coachingSectionKeys: Array<keyof SessionFeedbackType>;
    requiresRetry: boolean;
    completionReason: string | null;
    onSeekToSecond: (seconds: number) => void;
    sessionId?: string;
    uid?: string;
};

export function SessionFeedbackSection(props: Readonly<Props>) {
    const {
        shouldShowResults,
        isSkipped,
        currentTranscript,
        currentServerTranscript,
        currentAnalysis,
        currentFeedback,
        hasMainOverview,
        coachingSectionKeys,
        requiresRetry,
        completionReason,
        onSeekToSecond,
        sessionId,
        uid,
    } = props;

    if (!shouldShowResults) return null;

    if (isSkipped) {
        return (
            <div className="mt-6 space-y-4 rounded-xl border border-border/70 p-4">
                <div>
                    <p className="text-sm font-medium">Skipped drill</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        No coaching was generated for this one. If you shared a
                        quick note, it helps us pick better drills later.
                    </p>
                </div>
                {currentTranscript ? (
                    <DrillTranscriptView
                        serverTranscript={currentServerTranscript}
                        transcript={currentTranscript}
                        feedback={null}
                        onSeekToSecond={onSeekToSecond}
                        heading="Why you skipped"
                    />
                ) : null}
            </div>
        );
    }

    const hasNativeSpeakerVersion = Boolean(
        currentFeedback?.nativeSpeakerVersion?.trim(),
    );

    return (
        <Tabs defaultValue="main" className="mt-6">
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                <TabsTrigger value="main" className="shrink-0">
                    <FileText className="size-3.5" />
                    Main
                </TabsTrigger>
                <TabsTrigger value="coaching" className="shrink-0">
                    <Lightbulb className="size-3.5" />
                    Coaching
                </TabsTrigger>
                <TabsTrigger value="native-speaker" className="shrink-0">
                    <Sparkles className="size-3.5" />
                    Improved Version
                </TabsTrigger>
            </TabsList>
            <TabsContent value="main" className="mt-3 space-y-4">
                {currentAnalysis ? (
                    <DrillOverviewPanel
                        analysis={currentAnalysis}
                        needsRetry={requiresRetry}
                        completionReason={completionReason}
                        sessionId={sessionId}
                        uid={uid}
                        onSeekToSecond={onSeekToSecond}
                    />
                ) : hasMainOverview && currentFeedback?.overview ? (
                    <div className="rounded-xl border border-border/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Sparkles className="size-4" />
                            Overview
                        </div>
                        <div className="mt-3 rounded-lg border border-border/50 bg-background/50 p-3">
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {currentFeedback.overview}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">Overview</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Waiting for overview…
                        </p>
                    </div>
                )}
                {currentTranscript ||
                (currentServerTranscript &&
                    currentServerTranscript.length > 0) ? (
                    <DrillTranscriptView
                        serverTranscript={currentServerTranscript}
                        transcript={currentTranscript}
                        feedback={currentFeedback}
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
            </TabsContent>
            <TabsContent value="coaching" className="mt-3">
                {currentFeedback && coachingSectionKeys.length > 0 ? (
                    <CoachingMomentsView
                        feedback={currentFeedback}
                        onSeekToSecond={onSeekToSecond}
                        sessionId={sessionId}
                        uid={uid}
                    />
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">Coaching</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Waiting for coaching feedback…
                        </p>
                    </div>
                )}
            </TabsContent>
            <TabsContent value="native-speaker" className="mt-3">
                {hasNativeSpeakerVersion && currentFeedback ? (
                    <ImprovedVersionView
                        content={currentFeedback.nativeSpeakerVersion!}
                    />
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">
                            Improved Version
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Start a new drill to get an improved version of your
                            performance with audio playback.
                        </p>
                    </div>
                )}
            </TabsContent>
        </Tabs>
    );
}
