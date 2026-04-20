"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
    MessageCircle,
    Mic,
    Square,
    Send,
    X,
    Loader2,
    Keyboard,
} from "lucide-react";
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
    const [showTextInput, setShowTextInput] = useState(false);
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

    useEffect(() => {
        if (isOpen && showTextInput && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen, showTextInput]);

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
                onClick={() => {
                    track("feedback_chat_opened", { source });
                    setIsOpen(true);
                }}
                className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
                <MessageCircle className="size-3.5" />
                Discuss this feedback
            </button>
        );
    }

    return (
        <div className="mt-3 rounded-lg border border-border/50 bg-muted/30">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <span className="text-xs font-medium text-muted-foreground">
                    Discuss: {sectionTitle}
                </span>
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
                    <X className="size-3" />
                </Button>
            </div>

            <div
                ref={scrollRef}
                className="max-h-64 overflow-y-auto px-3 py-2 space-y-3"
            >
                {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                        Tap the mic and ask about this feedback — challenge it,
                        ask for examples, or dig deeper.
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
                                "text-[10px] font-medium uppercase tracking-wide",
                                message.role === "user"
                                    ? "text-foreground/60"
                                    : "text-muted-foreground/60",
                            )}
                        >
                            {message.role === "user" ? "You" : "Coach"}
                        </span>
                        <div className="mt-0.5 leading-relaxed">
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

                {isTranscribing ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Transcribing your message...
                    </div>
                ) : null}

                {isLoading &&
                messages[messages.length - 1]?.role !== "assistant" ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Thinking...
                    </div>
                ) : null}
            </div>

            {(voiceError || recorder.error) ? (
                <p className="px-3 pb-1 text-xs text-destructive">
                    {voiceError || recorder.error}
                </p>
            ) : null}

            <div className="border-t border-border/50 px-3 py-2">
                {recorder.isRecording ? (
                    <div className="flex items-center gap-3">
                        <LiveWaveform
                            stream={recorder.stream}
                            active
                            className="flex-1"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleVoiceToggle()}
                        >
                            <Square className="size-3" />
                            Done
                        </Button>
                    </div>
                ) : showTextInput ? (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSendText();
                        }}
                        className="flex items-end gap-2"
                    >
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Type your question..."
                            rows={1}
                            className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none min-h-[32px] max-h-[80px] py-1.5"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setShowTextInput(false)}
                            title="Switch to voice"
                        >
                            <Mic className="size-3.5" />
                        </Button>
                        <Button
                            type="submit"
                            variant="ghost"
                            size="icon-xs"
                            disabled={!input.trim() || isBusy}
                        >
                            <Send className="size-3.5" />
                        </Button>
                    </form>
                ) : (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="default"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void handleVoiceToggle()}
                            className="flex-1"
                        >
                            <Mic className="size-3.5" />
                            {isBusy ? "Processing..." : "Tap to speak"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setShowTextInput(true)}
                            disabled={isBusy}
                            title="Type instead"
                        >
                            <Keyboard className="size-3.5" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
