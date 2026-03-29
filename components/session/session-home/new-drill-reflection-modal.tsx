import { Loader2, Mic, Square } from "lucide-react";
import type { ReactNode } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { VoiceRecorderControls } from "@/hooks/use-voice-recorder";
import { cn } from "@/lib/utils";

import type { PreNewDrillReflectionState } from "./types";

type Props = {
    open: boolean;
    context: PreNewDrillReflectionState | null;
    reflectionFeedbackText: string;
    onReflectionFeedbackTextChange: (value: string) => void;
    reflectionSubmitting: boolean;
    isTranscribing: boolean;
    transcribeError: string | null;
    modalRecorder: VoiceRecorderControls;
    onToggleSpeak: () => void;
    onAction: (mode: "share" | "decline" | "clear") => void;
};

export function NewDrillReflectionModal(props: Readonly<Props>) {
    const {
        open,
        context,
        reflectionFeedbackText,
        onReflectionFeedbackTextChange,
        reflectionSubmitting,
        isTranscribing,
        transcribeError,
        modalRecorder,
        onToggleSpeak,
        onAction,
    } = props;

    if (!open || !context) return null;

    const hasAnswer = reflectionFeedbackText.trim().length > 0;
    const shareDisabled =
        reflectionSubmitting || !hasAnswer || modalRecorder.isRecording;

    let speakButtonLabel: ReactNode;
    if (isTranscribing) {
        speakButtonLabel = (
            <>
                <Loader2 className="size-4 animate-spin" />
                Transcribing...
            </>
        );
    } else if (modalRecorder.isRecording) {
        speakButtonLabel = (
            <>
                <Square className="size-4 fill-current" />
                Stop
            </>
        );
    } else {
        speakButtonLabel = (
            <>
                <Mic />
                Speak
            </>
        );
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !reflectionSubmitting) {
                    onAction("clear");
                }
            }}
            disablePointerDismissal={reflectionSubmitting}
        >
            <DialogContent className="gap-0 sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Quick check-in</DialogTitle>
                    <DialogDescription>
                        How was{" "}
                        <span className="font-medium text-foreground">
                            {context.scenarioTitle}
                        </span>
                        {" "}? What you share here helps us tune future drills
                        for you.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">
                        What stood out—or what would you do differently next
                        time?
                    </p>
                    <LiveWaveform
                        stream={modalRecorder.stream}
                        active={modalRecorder.isRecording}
                    />
                    <div className="flex justify-center">
                        <Button
                            type="button"
                            variant={
                                modalRecorder.isRecording
                                    ? "secondary"
                                    : "outline"
                            }
                            size="lg"
                            className="gap-2 rounded-full"
                            disabled={reflectionSubmitting || isTranscribing}
                            onClick={() => {
                                onToggleSpeak();
                            }}
                        >
                            {speakButtonLabel}
                        </Button>
                    </div>
                    {(modalRecorder.error || transcribeError) && (
                        <p
                            className="text-center text-xs text-destructive"
                            role="alert"
                        >
                            {modalRecorder.error ?? transcribeError}
                        </p>
                    )}
                    <p className="text-center text-xs text-muted-foreground">
                        Tap the mic to record and transcribe, or type your
                        answer.
                    </p>
                    <textarea
                        id="reflection-answer"
                        className={cn(
                            "w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm",
                            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                            "outline-none",
                        )}
                        rows={3}
                        placeholder="e.g. Felt clearer on the opening, or I’d slow down before the ask."
                        value={reflectionFeedbackText}
                        onChange={(e) =>
                            onReflectionFeedbackTextChange(e.target.value)
                        }
                        disabled={
                            reflectionSubmitting ||
                            modalRecorder.isRecording
                        }
                    />
                </div>

                <DialogFooter className="mt-6 gap-2 sm:justify-start">
                    <Button
                        type="button"
                        disabled={shareDisabled}
                        onClick={() => onAction("share")}
                    >
                        {reflectionSubmitting ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Continue"
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={reflectionSubmitting}
                        onClick={() => onAction("decline")}
                    >
                        No thanks
                    </Button>
                </DialogFooter>

                <div className="mt-2 border-t border-border/60 pt-4">
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto min-h-0 p-0 text-xs font-normal text-muted-foreground underline-offset-4 hover:text-foreground"
                        disabled={reflectionSubmitting}
                        onClick={() => onAction("clear")}
                    >
                        Not now — don&apos;t ask this time
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
