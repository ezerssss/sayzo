import { Loader2, Mic, Play, RotateCcw, SkipForward, Square } from "lucide-react";
import type { RefObject } from "react";

import { AudioPlayer } from "@/components/session/audio-player";
import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import type { DrillState } from "./types";

type Props = {
    mm: number;
    ss: number;
    stateLabel: string;
    requiresRetry: boolean;
    isRecording: boolean;
    stream: MediaStream | null;
    showRecordAction: boolean;
    showCompletionActions: boolean;
    showSkipDrill: boolean;
    skipSubmitting: boolean;
    isCreatingDrill: boolean;
    drillState: DrillState;
    hasPendingAnalysisRequest: boolean;
    shouldShowResults: boolean;
    shouldShowAnalyzingState: boolean;
    playbackSrc: string | null;
    audioRef: RefObject<HTMLAudioElement | null>;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onOpenSkipModal: () => void;
    onRedoDrill: () => void;
};

export function SessionControlsPanel(props: Readonly<Props>) {
    const {
        mm,
        ss,
        stateLabel,
        requiresRetry,
        isRecording,
        stream,
        showRecordAction,
        showCompletionActions,
        showSkipDrill,
        skipSubmitting,
        isCreatingDrill,
        drillState,
        hasPendingAnalysisRequest,
        shouldShowResults,
        shouldShowAnalyzingState,
        playbackSrc,
        audioRef,
        onStartRecording,
        onStopRecording,
        onOpenSkipModal,
        onRedoDrill,
    } = props;

    return (
        <div className="mt-6 rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Session status</p>
                <span className="font-mono text-sm">{`${mm}:${ss.toString().padStart(2, "0")}`}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{stateLabel}</p>
            {requiresRetry ? (
                <p className="mt-2 text-sm text-amber-700">
                    Please redo this drill before creating a new one.
                </p>
            ) : null}
            {isRecording ? (
                <LiveWaveform stream={stream} active className="mt-3" />
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                    {showRecordAction ? (
                        <>
                            <Button
                                variant={isRecording ? "secondary" : "default"}
                                disabled={
                                    drillState === "analyzing" ||
                                    hasPendingAnalysisRequest
                                }
                                onClick={() =>
                                    void (isRecording
                                        ? onStopRecording()
                                        : onStartRecording())
                                }
                            >
                                {isRecording ? <Square /> : <Mic />}
                                {isRecording
                                    ? "Stop recording"
                                    : "Record response"}
                            </Button>
                            {showSkipDrill ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={skipSubmitting}
                                    onClick={onOpenSkipModal}
                                >
                                    <SkipForward />
                                    Skip this drill
                                </Button>
                            ) : null}
                        </>
                    ) : null}
                    {showCompletionActions ? (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => {
                                void audioRef.current?.play();
                            }}
                            disabled={!playbackSrc}
                        >
                            <Play />
                            Listen to response
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => void onRedoDrill()}
                        >
                            <RotateCcw />
                            Redo this drill
                        </Button>
                    </>
                ) : null}
                </div>
                {showSkipDrill && showRecordAction ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Not a good time for this scenario? You can skip and
                        we&apos;ll pick a different drill next.
                    </p>
                ) : null}
            </div>
            {shouldShowResults && playbackSrc ? (
                <AudioPlayer
                    src={playbackSrc}
                    audioRef={audioRef}
                    className="mt-4"
                />
            ) : null}
            {shouldShowAnalyzingState ||
            isCreatingDrill ||
            skipSubmitting ? (
                <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {stateLabel}
                </div>
            ) : null}
        </div>
    );
}
