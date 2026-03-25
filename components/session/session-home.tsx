"use client";

import { ArrowRight, Loader2, Mic, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import type { SessionPlanType } from "@/types/sessions";
import { FeedbackPanel } from "@/components/session/feedback-panel";
import { TranscriptPanel } from "@/components/session/transcript-panel";

interface PropsInterface {
    userLabel: string;
    onSignOut: () => void;
    authError?: string | null;
}

type DrillState = "idle" | "recording" | "analyzing" | "complete";

const MAX_SECONDS = 5 * 60; // Max time allowed for a drill.
const EMPTY_CAPTIONS_VTT = "data:text/vtt,WEBVTT";

const MOCK_PLANS: SessionPlanType[] = [
    {
        scenario: {
            title: "Design Review Alignment",
            situationContext:
                "You are leading a cross-functional design review with product and engineering stakeholders.",
            givenContent:
                "Explain one risky design decision, justify trade-offs, and close with a clear ask.",
            task: "Make your recommendation actionable and specific to the team.",
        },
        focus: ["Concise structure", "Stakeholder language", "Confident pacing"],
    },
    {
        scenario: {
            title: "Project Status Update",
            situationContext:
                "You are giving a short weekly status update to a cross-functional leadership group.",
            givenContent:
                "Summarize progress, call out risks early, and propose next steps with owners.",
            task: "Keep it structured: what changed, what it means, and what you need today.",
        },
        focus: ["Clear updates", "Risk framing", "Ownership & next steps"],
    },
];

const MOCK_TRANSCRIPTS = [
    `Thanks everyone. I want to quickly align on one risky decision in this sprint.

We can either ship the simplified flow now and iterate, or delay for the full version.

I recommend shipping the simplified flow this sprint because it reduces implementation risk and still validates user intent.

The trade-off is a slightly less polished first-time experience, but we can improve that in the next release with real usage data.

My ask is to approve this phased rollout today so engineering can keep the current timeline.`,
    `Good morning everyone. Quick update on progress this week.

We completed the core integration and reduced our remaining setup steps from five to two.

The main risk is timeline pressure if requirements shift late, so we should lock scope for the next two days.

Next steps: design finalizes the screens today, engineering starts implementation tomorrow, and I will circulate an updated rollout plan by end of day.

What we need from leadership today is approval to proceed under the locked scope so we can hit the milestone.`,
];

const MOCK_FEEDBACK_MDS = [
    `
## What worked well
- You established a clear decision point early, which is strong for stakeholder meetings.
- Your recommendation and rationale were understandable and practical.

## Moments to tighten
- **Opening framing**: “one risky decision” is good, but you can be more concrete:
  - Better option: “one high-impact decision that affects timeline and user onboarding quality.”
- **Trade-off sentence**: “slightly less polished” is vague for non-design stakeholders.
  - Better option: “users will see fewer customization options in v1, but core task completion remains unchanged.”
- **Final ask**: strong close; make ownership explicit:
  - Better option: “If approved today, design will deliver final specs by EOD and engineering starts tomorrow.”

## Next repetition
Do one more take with this structure:
1. Decision statement
2. Two options
3. Recommendation + reason
4. Risk + mitigation
5. Clear owner + timeline ask
`,
    `
## What worked well
- You reported progress with concrete change (“five to two”), which makes status credible.
- Risks were surfaced early, and you proposed a mitigation instead of only describing uncertainty.

## Moments to tighten
- **Scope risk**: “if requirements shift late” is clear; make the trigger explicit:
  - Better option: “if requirements change after today’s scope lock…”
- **Ownership**: great that you named roles; make timing tighter:
  - Better option: “design finalizes by 4pm today; engineering starts at 9am tomorrow.”

## Next repetition
Try this 5-part template:
1. What changed
2. What it means
3. Top risk (with trigger)
4. Mitigation / plan
5. What you need today (approval, decision, or action)
`,
];

// Transcript + feedback rendering live in dedicated components.

export function SessionHome(props: Readonly<PropsInterface>) {
    const { userLabel, onSignOut, authError } = props;
    const [drillState, setDrillState] = useState<DrillState>("idle");
    const [seconds, setSeconds] = useState(MAX_SECONDS);
    const [currentDrillIndex, setCurrentDrillIndex] = useState(0);
    const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
    const { isRecording, stream, start, stop } = useVoiceRecorder();

    const currentPlan = useMemo(() => {
        return MOCK_PLANS[currentDrillIndex % MOCK_PLANS.length];
    }, [currentDrillIndex]);

    const currentTranscript = useMemo(() => {
        return MOCK_TRANSCRIPTS[currentDrillIndex % MOCK_TRANSCRIPTS.length];
    }, [currentDrillIndex]);

    const currentFeedback = useMemo(() => {
        return MOCK_FEEDBACK_MDS[currentDrillIndex % MOCK_FEEDBACK_MDS.length];
    }, [currentDrillIndex]);

    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;

    useEffect(() => {
        if (drillState !== "recording") {
            return;
        }
        const id = setInterval(() => {
            setSeconds((s) => {
                if (s <= 1) {
                    setDrillState("analyzing");
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [drillState, isRecording]);

    useEffect(() => {
        return () => {
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
        };
    }, [recordedAudioUrl]);

    useEffect(() => {
        if (drillState !== "analyzing") {
            return;
        }
        const id = setTimeout(() => {
            setDrillState("complete");
        }, 1500);
        return () => clearTimeout(id);
    }, [drillState, isRecording]);

    const stateLabel = useMemo(() => {
        if (isRecording || drillState === "recording") {
            return "Recording your response...";
        }
        if (drillState === "analyzing") {
            return "Analyzing your session...";
        }
        if (drillState === "complete") {
            return "Session complete. Review your feedback below.";
        }
        return "Ready when you are.";
    }, [drillState, isRecording]);

    const startRecording = async () => {
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            setRecordedAudioUrl(null);
        }
        setSeconds(MAX_SECONDS);
        setDrillState("recording");
        await start();
    };

    const stopRecording = async () => {
        const result = await stop();
        if (result?.blob.size) {
            if (recordedAudioUrl) {
                URL.revokeObjectURL(recordedAudioUrl);
            }
            setRecordedAudioUrl(URL.createObjectURL(result.blob));
        }
        setSeconds(0);
        setDrillState("analyzing");
    };

    return (
        <section className="w-full max-w-3xl rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">You&apos;re in</h1>
                    <p className="text-sm text-muted-foreground">
                        Signed in as{" "}
                        <span className="font-medium text-foreground">{userLabel}</span>
                    </p>
                </div>
                <Button variant="outline" onClick={onSignOut}>
                    Sign out
                </Button>
            </div>

            <div className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Today&apos;s Drill
                        </p>
                        <h2 className="mt-1 text-lg font-semibold">
                            {currentPlan.scenario.title}
                        </h2>
                    </div>
                    {drillState === "complete" ? (
                        <Button
                            onClick={() => {
                                setCurrentDrillIndex((i) => i + 1);
                                setSeconds(MAX_SECONDS);
                                setDrillState("idle");
                                if (recordedAudioUrl) {
                                    URL.revokeObjectURL(recordedAudioUrl);
                                    setRecordedAudioUrl(null);
                                }
                            }}
                        >
                            <ArrowRight />
                            Start another drill
                        </Button>
                    ) : null}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    {currentPlan.scenario.situationContext}
                </p>
                <p className="mt-2 text-sm">
                    {currentPlan.scenario.givenContent}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {currentPlan.focus.map((item) => (
                        <span
                            key={item}
                            className="rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                        >
                            {item}
                        </span>
                    ))}
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-border/70 p-4">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Session status</p>
                    <span className="font-mono text-sm">{`${mm}:${ss.toString().padStart(2, "0")}`}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{stateLabel}</p>
                {isRecording ? (
                    <LiveWaveform stream={stream} active className="mt-3" />
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    {drillState === "complete" ? null : (
                        <Button
                            variant={isRecording ? "secondary" : "outline"}
                            disabled={drillState === "analyzing"}
                            onClick={() => void (isRecording ? stopRecording() : startRecording())}
                        >
                            {isRecording ? <Square /> : <Mic />}
                            {isRecording ? "Stop recording" : "Record response"}
                        </Button>
                    )}
                    {drillState === "complete" ? (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    const el = document.getElementById(
                                        "session-audio-playback",
                                    ) as HTMLAudioElement | null;
                                    void el?.play();
                                }}
                                disabled={!recordedAudioUrl}
                            >
                                <Play />
                                Listen to response
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => void startRecording()}
                            >
                                <RotateCcw />
                                Redo this drill
                            </Button>
                        </>
                    ) : null}
                </div>
                {drillState === "complete" && recordedAudioUrl ? (
                    <audio
                        id="session-audio-playback"
                        className="mt-4 w-full"
                        controls
                        src={recordedAudioUrl}
                    >
                        <track
                            kind="captions"
                            label="English captions"
                            srcLang="en"
                            src={EMPTY_CAPTIONS_VTT}
                            default
                        />
                    </audio>
                ) : null}
                {drillState === "analyzing" ? (
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Running planner + analyzer + memory updates (mock)...
                    </div>
                ) : null}
            </div>

            {drillState === "complete" ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <TranscriptPanel transcript={currentTranscript} />
                    <FeedbackPanel feedbackMarkdown={currentFeedback} />
                </div>
            ) : null}

            {authError ? (
                <p className="mt-4 text-xs text-destructive" role="alert">
                    {authError}
                </p>
            ) : null}
        </section>
    );
}
