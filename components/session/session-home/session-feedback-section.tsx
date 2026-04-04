import { CoachingPanel } from "@/components/session/coaching-panel";
import { FeedbackPanel } from "@/components/session/feedback-panel";
import { NativeSpeakerPanel } from "@/components/session/native-speaker-panel";
import { TranscriptPanel } from "@/components/session/transcript-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionFeedbackType } from "@/types/sessions";

type Props = {
    shouldShowResults: boolean;
    isSkipped: boolean;
    currentTranscript: string;
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
                    <TranscriptPanel
                        transcript={currentTranscript}
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
                    Main
                </TabsTrigger>
                <TabsTrigger value="coaching" className="shrink-0">
                    Coaching
                </TabsTrigger>
                <TabsTrigger value="native-speaker" className="shrink-0">
                    Improved Version
                </TabsTrigger>
            </TabsList>
            <TabsContent value="main" className="mt-3 space-y-4">
                {hasMainOverview && currentFeedback ? (
                    <FeedbackPanel
                        feedback={currentFeedback}
                        onSeekToSecond={onSeekToSecond}
                        needsRetry={requiresRetry}
                        completionReason={completionReason}
                        sectionKey="overview"
                        sessionId={sessionId}
                        uid={uid}
                    />
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">Overview</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Waiting for overview…
                        </p>
                    </div>
                )}
                {currentTranscript ? (
                    <TranscriptPanel
                        transcript={currentTranscript}
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
                    <CoachingPanel
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
                    <NativeSpeakerPanel
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
