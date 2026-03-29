import { useMemo } from "react";

import { FeedbackPanel } from "@/components/session/feedback-panel";
import { TranscriptPanel } from "@/components/session/transcript-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SessionFeedbackType } from "@/types/sessions";

import { FEEDBACK_SECTION_LABELS } from "./constants";

type Props = {
    shouldShowResults: boolean;
    isSkipped: boolean;
    currentTranscript: string;
    currentFeedback: SessionFeedbackType | null;
    hasMainOverview: boolean;
    coachingSectionKeys: Array<keyof SessionFeedbackType>;
    practiceSectionKeys: Array<keyof SessionFeedbackType>;
    hasSinglePracticeSection: boolean;
    requiresRetry: boolean;
    completionReason: string | null;
    onSeekToSecond: (seconds: number) => void;
};

export function SessionFeedbackSection(props: Readonly<Props>) {
    const {
        shouldShowResults,
        isSkipped,
        currentTranscript,
        currentFeedback,
        hasMainOverview,
        coachingSectionKeys,
        practiceSectionKeys,
        hasSinglePracticeSection,
        requiresRetry,
        completionReason,
        onSeekToSecond,
    } = props;

    const practiceTabContent = useMemo(() => {
        if (!currentFeedback || practiceSectionKeys.length === 0) {
            return (
                <div className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm font-medium">Practice</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Waiting for practice guidance…
                    </p>
                </div>
            );
        }
        if (hasSinglePracticeSection) {
            return (
                <FeedbackPanel
                    feedback={currentFeedback}
                    onSeekToSecond={onSeekToSecond}
                    needsRetry={requiresRetry}
                    completionReason={completionReason}
                    sectionKey={practiceSectionKeys[0]}
                />
            );
        }
        return (
            <Tabs
                defaultValue={`practice-${practiceSectionKeys[0]}`}
                className="space-y-3"
            >
                <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                    {practiceSectionKeys.map((key) => (
                        <TabsTrigger
                            key={`practice-trigger-${key}`}
                            value={`practice-${key}`}
                            className="shrink-0"
                        >
                            {FEEDBACK_SECTION_LABELS[key]}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {practiceSectionKeys.map((key) => (
                    <TabsContent
                        key={`practice-content-${key}`}
                        value={`practice-${key}`}
                    >
                        <FeedbackPanel
                            feedback={currentFeedback}
                            onSeekToSecond={onSeekToSecond}
                            needsRetry={requiresRetry}
                            completionReason={completionReason}
                            sectionKey={key}
                        />
                    </TabsContent>
                ))}
            </Tabs>
        );
    }, [
        completionReason,
        currentFeedback,
        hasSinglePracticeSection,
        onSeekToSecond,
        practiceSectionKeys,
        requiresRetry,
    ]);

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

    return (
        <Tabs defaultValue="main" className="mt-6">
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                <TabsTrigger value="main" className="shrink-0">
                    Main
                </TabsTrigger>
                <TabsTrigger value="coaching" className="shrink-0">
                    Coaching
                </TabsTrigger>
                <TabsTrigger value="practice" className="shrink-0">
                    Practice
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
                    <Tabs
                        defaultValue={`coaching-${coachingSectionKeys[0]}`}
                        className="space-y-3"
                    >
                        <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                            {coachingSectionKeys.map((key) => (
                                <TabsTrigger
                                    key={`coaching-trigger-${key}`}
                                    value={`coaching-${key}`}
                                    className="shrink-0"
                                >
                                    {FEEDBACK_SECTION_LABELS[key]}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        {coachingSectionKeys.map((key) => (
                            <TabsContent
                                key={`coaching-content-${key}`}
                                value={`coaching-${key}`}
                            >
                                <FeedbackPanel
                                    feedback={currentFeedback}
                                    onSeekToSecond={onSeekToSecond}
                                    needsRetry={requiresRetry}
                                    completionReason={completionReason}
                                    sectionKey={key}
                                />
                            </TabsContent>
                        ))}
                    </Tabs>
                ) : (
                    <div className="rounded-xl border border-border/70 p-4">
                        <p className="text-sm font-medium">Coaching</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Waiting for coaching feedback…
                        </p>
                    </div>
                )}
            </TabsContent>
            <TabsContent value="practice" className="mt-3">
                {practiceTabContent}
            </TabsContent>
        </Tabs>
    );
}
