import { ArrowRight, Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MarkdownBlock } from "@/components/session/markdown-block";
import { Button } from "@/components/ui/button";
import type { SessionPlanType } from "@/types/sessions";

type Props = {
    plan: SessionPlanType;
    uid: string;
    shouldShowResults: boolean;
    loadingSession: boolean;
    isCreatingDrill: boolean;
    requiresRetry: boolean;
    reflectionModalOpen: boolean;
    reflectionSubmitting: boolean;
    skipSubmitting: boolean;
    onStartAnotherDrill: () => void;
};

const AUTOPLAY_STORAGE_KEY = "eloquy.drill.autoplay";
const PLAYBACK_RATE = 1.25;
const TTS_CACHE_NAME = "eloquy-tts-v1";

function readAutoplayPref(): boolean {
    if (typeof window === "undefined") return true;
    try {
        const raw = window.localStorage.getItem(AUTOPLAY_STORAGE_KEY);
        return raw === null ? true : raw === "on";
    } catch {
        return true;
    }
}

function writeAutoplayPref(value: boolean) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            AUTOPLAY_STORAGE_KEY,
            value ? "on" : "off",
        );
    } catch {
        // Ignore storage failures (private mode, etc.).
    }
}

async function hashNarration(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// Cache API key is just a synthetic URL; it's never actually fetched.
function cacheKeyFor(hash: string): string {
    return `/_cache/tts/${hash}`;
}

async function readCachedAudio(text: string): Promise<Blob | null> {
    if (typeof window === "undefined" || !("caches" in window)) return null;
    try {
        const hash = await hashNarration(text);
        const cache = await caches.open(TTS_CACHE_NAME);
        const match = await cache.match(cacheKeyFor(hash));
        return match ? await match.blob() : null;
    } catch {
        return null;
    }
}

async function writeCachedAudio(text: string, blob: Blob): Promise<void> {
    if (typeof window === "undefined" || !("caches" in window)) return;
    try {
        const hash = await hashNarration(text);
        const cache = await caches.open(TTS_CACHE_NAME);
        await cache.put(
            cacheKeyFor(hash),
            new Response(blob, {
                headers: { "Content-Type": "audio/mpeg" },
            }),
        );
    } catch {
        // Quota or other storage failures — best effort only.
    }
}

// The planner sometimes emits numbered or bulleted steps inline as one
// paragraph ("1. First... 2. Second... 3. Third..."). Markdown then treats
// only the leading "1." as a list marker. Break each step onto its own line
// so ReactMarkdown renders a proper list.
function normalizeMarkdownList(md: string): string {
    if (!md) return md;
    return md
        .trim()
        .replace(/\s+(\d+[.)]\s)/g, "\n$1")
        .replace(/(^|\n)\s*[-*]\s+/g, "$1- ");
}

export function DrillBriefCard(props: Readonly<Props>) {
    const {
        plan,
        uid,
        shouldShowResults,
        loadingSession,
        isCreatingDrill,
        requiresRetry,
        reflectionModalOpen,
        reflectionSubmitting,
        skipSubmitting,
        onStartAnotherDrill,
    } = props;

    const question = plan.scenario.question?.trim() ?? "";
    const situationContext = plan.scenario.situationContext?.trim() ?? "";
    // Narrate only what someone would actually say to the learner. If there's
    // no explicit prompt line, fall back to the situation as a minimal framing.
    const narrationText = question || situationContext;
    const promptBody = question || situationContext;

    const hasDetails = Boolean(
        (question && situationContext) ||
            plan.scenario.givenContent?.trim() ||
            plan.scenario.framework?.trim() ||
            plan.skillTarget?.trim(),
    );

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const autoplayAttemptedRef = useRef(false);
    const [playbackState, setPlaybackState] = useState<
        "idle" | "loading" | "playing"
    >("idle");
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const [autoplayEnabled, setAutoplayEnabled] = useState(true);

    // Hydrate pref from localStorage on mount (avoids SSR/client mismatch).
    useEffect(() => {
        setAutoplayEnabled(readAutoplayPref());
    }, []);

    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }
        };
    }, []);

    // Reset cached audio whenever the narrated text changes.
    useEffect(() => {
        audioRef.current?.pause();
        audioRef.current = null;
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        autoplayAttemptedRef.current = false;
        setPlaybackState("idle");
        setPlaybackError(null);
    }, [narrationText]);

    const loadAndPlay = useCallback(
        async (signal?: AbortSignal): Promise<void> => {
            if (!narrationText) return;
            if (signal?.aborted) return;

            if (audioRef.current && audioUrlRef.current) {
                try {
                    audioRef.current.playbackRate = PLAYBACK_RATE;
                    await audioRef.current.play();
                    if (signal?.aborted) {
                        audioRef.current.pause();
                        return;
                    }
                    setPlaybackState("playing");
                } catch {
                    setPlaybackState("idle");
                }
                return;
            }

            let blob: Blob | null = await readCachedAudio(narrationText);
            if (signal?.aborted) return;

            if (!blob) {
                setPlaybackState("loading");
                setPlaybackError(null);
                try {
                    const res = await fetch("/api/tts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: narrationText, uid }),
                        signal,
                    });
                    if (signal?.aborted) return;
                    if (!res.ok) {
                        throw new Error(`Request failed (${res.status})`);
                    }
                    blob = await res.blob();
                    if (signal?.aborted) return;
                    void writeCachedAudio(narrationText, blob);
                } catch (err) {
                    if ((err as Error)?.name === "AbortError") return;
                    setPlaybackState("idle");
                    setPlaybackError("Couldn't play the prompt. Try again.");
                    return;
                }
            }

            const url = URL.createObjectURL(blob);
            audioUrlRef.current = url;

            const audio = new Audio(url);
            audio.playbackRate = PLAYBACK_RATE;
            audioRef.current = audio;
            audio.addEventListener("ended", () => setPlaybackState("idle"));
            audio.addEventListener("pause", () => {
                if (!audio.ended) setPlaybackState("idle");
            });

            try {
                await audio.play();
                if (signal?.aborted) {
                    audio.pause();
                    return;
                }
                setPlaybackState("playing");
            } catch {
                // Autoplay likely blocked — leave the button in idle so
                // the user can start it with a click.
                setPlaybackState("idle");
            }
        },
        [narrationText, uid],
    );

    // Auto-play once per drill when the pref is on. The AbortController
    // cancels an in-flight fetch if the effect re-runs (e.g. Strict Mode
    // double-mount in dev), preventing overlapping audio streams.
    useEffect(() => {
        if (!autoplayEnabled) return;
        if (!narrationText) return;
        if (autoplayAttemptedRef.current) return;
        autoplayAttemptedRef.current = true;

        const controller = new AbortController();
        void loadAndPlay(controller.signal);

        return () => {
            controller.abort();
        };
    }, [autoplayEnabled, narrationText, loadAndPlay]);

    async function handleTogglePlayback() {
        if (!narrationText) return;

        if (playbackState === "playing") {
            audioRef.current?.pause();
            setPlaybackState("idle");
            return;
        }

        await loadAndPlay();
    }

    function handleToggleAutoplay() {
        setAutoplayEnabled((prev) => {
            const next = !prev;
            writeAutoplayPref(next);
            return next;
        });
    }

    return (
        <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
                    Today&apos;s drill
                    {plan.scenario.title ? (
                        <>
                            <span className="mx-1.5 text-sky-700/50">
                                ·
                            </span>
                            <span className="font-normal normal-case text-foreground/80">
                                {plan.scenario.title}
                            </span>
                        </>
                    ) : null}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {narrationText ? (
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleTogglePlayback()}
                                disabled={playbackState === "loading"}
                                aria-label={
                                    playbackState === "playing"
                                        ? "Pause prompt"
                                        : "Listen to prompt"
                                }
                                className="h-7 gap-1.5 px-2 text-xs"
                            >
                                {playbackState === "loading" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : playbackState === "playing" ? (
                                    <Pause className="h-3.5 w-3.5" />
                                ) : (
                                    <Play className="h-3.5 w-3.5" />
                                )}
                                {playbackState === "playing"
                                    ? "Pause"
                                    : "Listen"}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleToggleAutoplay}
                                aria-pressed={autoplayEnabled}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                                Auto-play: {autoplayEnabled ? "on" : "off"}
                            </Button>
                        </div>
                    ) : null}
                    {shouldShowResults ? (
                        <Button
                            onClick={() => void onStartAnotherDrill()}
                            disabled={
                                loadingSession ||
                                isCreatingDrill ||
                                requiresRetry ||
                                reflectionModalOpen ||
                                reflectionSubmitting ||
                                skipSubmitting
                            }
                        >
                            <ArrowRight />
                            {isCreatingDrill
                                ? "Building next drill..."
                                : "Start another drill"}
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* The prompt itself — styled as something being said to you. */}
            {promptBody ? (
                <div className="mt-4 rounded-lg border-2 border-foreground/20 bg-background p-5">
                    <p className="text-xl font-semibold leading-relaxed">
                        &ldquo;{promptBody}&rdquo;
                    </p>
                    {playbackError ? (
                        <p
                            className="mt-2 text-xs text-destructive"
                            role="alert"
                        >
                            {playbackError}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {/* Everything else is optional reading — collapsed by default. */}
            {hasDetails ? (
                <details className="mt-3 rounded-lg border border-border/60 bg-background/50">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                        Prompt details
                    </summary>
                    <div className="space-y-4 px-3 pb-3 pt-1 text-sm">
                        {question && situationContext ? (
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Context
                                </p>
                                <p className="mt-1 text-muted-foreground">
                                    {situationContext}
                                </p>
                            </div>
                        ) : null}
                        {plan.scenario.givenContent ? (
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Reference
                                </p>
                                <div className="mt-1">
                                    <MarkdownBlock
                                        markdown={normalizeMarkdownList(
                                            plan.scenario.givenContent,
                                        )}
                                    />
                                </div>
                            </div>
                        ) : null}
                        {plan.scenario.framework ? (
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Framework
                                </p>
                                <div className="mt-1">
                                    <MarkdownBlock
                                        markdown={normalizeMarkdownList(
                                            plan.scenario.framework,
                                        )}
                                    />
                                </div>
                            </div>
                        ) : null}
                        {plan.skillTarget ? (
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Skill target
                                </p>
                                <p className="mt-1 text-muted-foreground">
                                    {plan.skillTarget}
                                </p>
                            </div>
                        ) : null}
                    </div>
                </details>
            ) : null}
        </div>
    );
}
