"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircle, Mic, Square, Send, X, Loader2 } from "lucide-react";
import {
    useRef,
    useEffect,
    useState,
    useMemo,
    type KeyboardEvent,
    type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";

import { LiveWaveform } from "@/components/onboarding/live-waveform";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { track } from "@/lib/analytics/client";
import { bucketLength } from "@/lib/analytics/events";
import { api } from "@/lib/api-client";
import { auth } from "@/lib/firebase/client";
import { getKyErrorMessage } from "@/lib/ky-error-message";
import { cn } from "@/lib/utils";

export type FeedbackChatSource = "session" | "capture";

interface FeedbackChatProps {
    source: FeedbackChatSource;
    sourceId: string;
    sectionKey: string;
    sectionTitle: string;
    feedbackContent: string;
    onSeekToSecond?: (seconds: number) => void;
}

function parseTimestamp(token: string): number | null {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(token);
    if (!m) return null;
    if (m[3] != null) {
        return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    return Number(m[1]) * 60 + Number(m[2]);
}

function renderTextWithTimestamps(
    text: string,
    onSeekToSecond: (seconds: number) => void,
): ReactNode[] {
    const pattern = /(?:(?:At|at)\s+)?(\[?)(\d{1,2}:\d{2}(?::\d{2})?)\]?/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        const timestamp = match[2];
        const seconds = parseTimestamp(timestamp);
        if (seconds == null) continue;

        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        parts.push(
            <button
                key={`ts-${match.index}`}
                type="button"
                className="inline rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80"
                onClick={() => onSeekToSecond(seconds)}
            >
                {timestamp}
            </button>,
        );
        lastIndex = match.index + match[0].length;
    }

    if (parts.length === 0) return [text];
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

function chatMarkdownComponents(onSeekToSecond?: (seconds: number) => void) {
    return {
        p: ({ children }: { children?: ReactNode }) => {
            if (onSeekToSecond && typeof children === "string") {
                return (
                    <p className="text-sm leading-relaxed">
                        {renderTextWithTimestamps(children, onSeekToSecond)}
                    </p>
                );
            }
            if (onSeekToSecond && Array.isArray(children)) {
                return (
                    <p className="text-sm leading-relaxed">
                        {children.map((child, i) => {
                            if (typeof child === "string") {
                                return (
                                    <span key={i}>
                                        {renderTextWithTimestamps(
                                            child,
                                            onSeekToSecond,
                                        )}
                                    </span>
                                );
                            }
                            return child;
                        })}
                    </p>
                );
            }
            return <p className="text-sm leading-relaxed">{children}</p>;
        },
        strong: ({ children }: { children?: ReactNode }) => {
            if (onSeekToSecond && typeof children === "string") {
                const seconds = parseTimestamp(
                    children.replace(/^At\s+/i, "").replace(/:$/, ""),
                );
                if (seconds != null) {
                    return (
                        <button
                            type="button"
                            className="inline rounded-md bg-muted px-1.5 py-0.5 font-semibold text-foreground underline decoration-dotted underline-offset-2 hover:bg-muted/80"
                            onClick={() => onSeekToSecond(seconds)}
                        >
                            {children}
                        </button>
                    );
                }
            }
            return (
                <strong className="font-semibold text-foreground/90">
                    {children}
                </strong>
            );
        },
        ul: ({ children }: { children?: ReactNode }) => (
            <ul className="list-disc pl-4 space-y-0.5">{children}</ul>
        ),
        li: ({ children }: { children?: ReactNode }) => (
            <li className="text-sm">{children}</li>
        ),
    };
}

export function FeedbackChat({
    source,
    sourceId,
    sectionKey,
    sectionTitle,
    feedbackContent,
    onSeekToSecond,
}: FeedbackChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const recorder = useVoiceRecorder();

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: "/api/feedback-chat",
                body: {
                    source,
                    sourceId,
                    sectionKey,
                    sectionTitle,
                    feedbackContent,
                },
                headers: async () => {
                    const user = auth.currentUser;
                    const headers: Record<string, string> = {};
                    if (user) {
                        const token = await user.getIdToken();
                        headers.Authorization = `Bearer ${token}`;
                    }
                    return headers;
                },
            }),
        [source, sourceId, sectionKey, sectionTitle, feedbackContent],
    );

    const { messages, sendMessage, status } = useChat({
        id: `feedback-chat-${source}-${sourceId}-${sectionKey}`,
        transport,
    });

    const isLoading = status === "streaming" || status === "submitted";
    const isBusy = isLoading || isTranscribing;

    const mdComponents = useMemo(
        () => chatMarkdownComponents(onSeekToSecond),
        [onSeekToSecond],
    );

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendText = () => {
        const text = input.trim();
        if (!text || isBusy) return;
        setInput("");
        track("feedback_chat_message_sent", {
            source,
            length_bucket: bucketLength(text.length),
            via: "text",
        });
        sendMessage({ text });
    };

    const handleVoiceToggle = async () => {
        setVoiceError(null);
        recorder.clearError();

        if (recorder.isRecording) {
            // Stop and transcribe
            const result = await recorder.stop();
            if (!result?.blob.size) return;

            setIsTranscribing(true);
            try {
                const fd = new FormData();
                fd.append(
                    "file",
                    new File([result.blob], "chat-voice.webm", {
                        type: result.mimeType,
                    }),
                );
                const data = await api
                    .post("/api/transcribe", {
                        body: fd,
                        timeout: 180_000,
                    })
                    .json<{ text?: string }>();
                const text = data.text?.trim() ?? "";
                if (text) {
                    track("feedback_chat_message_sent", {
                        source,
                        length_bucket: bucketLength(text.length),
                        via: "voice",
                    });
                    sendMessage({ text });
                } else {
                    setVoiceError(
                        "Couldn't pick up any words — try again or type instead.",
                    );
                }
            } catch (error) {
                setVoiceError(
                    await getKyErrorMessage(error, "Transcription failed."),
                );
            } finally {
                setIsTranscribing(false);
            }
            return;
        }

        // Start recording
        await recorder.start();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    };

    if (!isOpen) {
        return (
            <button
                type="button"
                data-tour="discuss-feedback"
                onClick={() => {
                    track("feedback_chat_opened", { source });
                    setIsOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50/60 px-3 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100/60 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-300 dark:hover:bg-sky-950/40"
            >
                <MessageCircle className="size-3.5" />
                Discuss this feedback
            </button>
        );
    }

    return (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageCircle className="size-3.5 shrink-0 text-sky-600" />
                    <span className="truncate">Discuss: {sectionTitle}</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                        if (recorder.isRecording) {
                            void recorder.stop();
                        }
                        setIsOpen(false);
                    }}
                >
                    <X className="size-3.5" />
                </Button>
            </div>

            <div
                ref={scrollRef}
                className="max-h-72 space-y-4 overflow-y-auto px-3.5 py-3"
            >
                {messages.length === 0 ? (
                    <p className="py-1 text-sm leading-relaxed text-muted-foreground">
                        Ask about this feedback — challenge it, ask for
                        examples, or dig deeper.
                    </p>
                ) : null}

                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={cn(
                            "text-sm",
                            message.role === "user"
                                ? "text-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        <span
                            className={cn(
                                "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
                                message.role === "user"
                                    ? "text-foreground/50"
                                    : "text-sky-700/70",
                            )}
                        >
                            {message.role === "user" ? "You" : "Coach"}
                        </span>
                        <div className="mt-1 leading-relaxed">
                            {message.parts.map((part, i) => {
                                if (part.type === "text") {
                                    return (
                                        <ReactMarkdown
                                            key={i}
                                            components={mdComponents}
                                        >
                                            {part.text}
                                        </ReactMarkdown>
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </div>
                ))}

                {isLoading &&
                messages[messages.length - 1]?.role !== "assistant" ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Thinking…
                    </div>
                ) : null}
            </div>

            {voiceError || recorder.error ? (
                <p className="px-3.5 pb-1 text-xs text-destructive">
                    {voiceError || recorder.error}
                </p>
            ) : null}

            {/* One unified input bar: text is always available, and the trailing
                control is Mic when empty / Send when typing — no mode toggle.
                Recording morphs the bar into a live waveform + stop. */}
            <div className="border-t border-border/50 p-2.5">
                {recorder.isRecording ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-sky-300 bg-background py-1.5 pl-3.5 pr-1.5">
                        <LiveWaveform
                            stream={recorder.stream}
                            active
                            className="h-8 flex-1"
                        />
                        <Button
                            size="icon-sm"
                            onClick={() => void handleVoiceToggle()}
                            className="rounded-full"
                            title="Stop & send"
                        >
                            <Square className="size-3.5 fill-current" />
                        </Button>
                    </div>
                ) : isTranscribing ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background px-3.5 py-3 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Transcribing…
                    </div>
                ) : (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSendText();
                        }}
                        className="flex items-end gap-1.5 rounded-2xl border border-border/60 bg-background py-1.5 pl-3.5 pr-1.5 transition-colors focus-within:border-sky-300"
                    >
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Ask about this feedback…"
                            rows={1}
                            className="max-h-[88px] min-h-[28px] flex-1 resize-none bg-transparent py-1 text-sm placeholder:text-muted-foreground focus:outline-none"
                        />
                        {input.trim() ? (
                            <Button
                                type="submit"
                                size="icon-sm"
                                disabled={isBusy}
                                className="rounded-full"
                                title="Send"
                            >
                                <Send className="size-3.5" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                size="icon-sm"
                                disabled={isBusy}
                                onClick={() => void handleVoiceToggle()}
                                className="rounded-full"
                                title="Speak"
                            >
                                <Mic className="size-4" />
                            </Button>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
}
