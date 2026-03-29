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

type Props = {
    open: boolean;
    skipFeedbackText: string;
    onSkipFeedbackTextChange: (value: string) => void;
    skipSubmitting: boolean;
    isTranscribing: boolean;
    transcribeError: string | null;
    modalRecorder: VoiceRecorderControls;
    onToggleSpeak: () => void;
    onSubmit: (opts: { withoutSharing: boolean }) => void;
    onCancel: () => void;
};

export function SkipDrillModal(props: Readonly<Props>) {
    const {
        open,
        skipFeedbackText,
        onSkipFeedbackTextChange,
        skipSubmitting,
        isTranscribing,
        transcribeError,
        modalRecorder,
        onToggleSpeak,
        onSubmit,
        onCancel,
    } = props;

    if (!open) return null;

    const hasReason = skipFeedbackText.trim().length > 0;
    const primaryDisabled =
        skipSubmitting || !hasReason || modalRecorder.isRecording;

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
                if (!next && !skipSubmitting) {
                    onCancel();
                }
            }}
            disablePointerDismissal={skipSubmitting}
        >
            <DialogContent className="gap-0 sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Skip this drill?</DialogTitle>
                    <DialogDescription>
                        We use your answer to pick drills that fit you better
                        next time.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">
                        Tell us why you want to skip this drill.
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
                            disabled={skipSubmitting || isTranscribing}
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
                        id="skip-drill-reason"
                        className={cn(
                            "w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm",
                            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                            "outline-none",
                        )}
                        rows={3}
                        placeholder="e.g. Not the right scenario for today, short on time, or this topic feels like a stretch."
                        value={skipFeedbackText}
                        onChange={(e) =>
                            onSkipFeedbackTextChange(e.target.value)
                        }
                        disabled={skipSubmitting || modalRecorder.isRecording}
                    />
                </div>

                <DialogFooter className="mt-6 gap-2 sm:justify-start">
                    <Button
                        type="button"
                        disabled={primaryDisabled}
                        onClick={() => onSubmit({ withoutSharing: false })}
                    >
                        {skipSubmitting ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Skipping…
                            </>
                        ) : (
                            "Skip and continue"
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={skipSubmitting}
                        onClick={async () => {
                            if (modalRecorder.isRecording) {
                                await modalRecorder.stop();
                            }
                            onCancel();
                        }}
                    >
                        Cancel
                    </Button>
                </DialogFooter>

                <div className="mt-2 border-t border-border/60 pt-4">
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto min-h-0 p-0 text-xs font-normal text-muted-foreground underline-offset-4 hover:text-foreground"
                        disabled={skipSubmitting}
                        onClick={() => onSubmit({ withoutSharing: true })}
                    >
                        Continue without sharing
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
