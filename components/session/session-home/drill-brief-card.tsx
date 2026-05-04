import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/client";
import { bucketLength } from "@/lib/analytics/events";
import { api } from "@/lib/api-client";
import type { SessionPlanType } from "@/types/sessions";

type Props = {
    plan: SessionPlanType;
    /** When false, suppress the auto-play-on-mount behavior regardless of the
     *  user's saved preference. Use for views that re-render the prompt for
     *  reference (e.g. completed drill results). */
    autoPlay?: boolean;
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

export function DrillBriefCard(props: Readonly<Props>) {
    const { plan, autoPlay = true } = props;

    const promptBody = plan.scenario.question.trim();
    const narrationText = promptBody;

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
            const textLengthBucket = bucketLength(narrationText.length);

            if (blob) {
                track("tts_response_received", {
                    cache_hit: true,
                    text_length_bucket: textLengthBucket,
                });
            } else {
                setPlaybackState("loading");
                setPlaybackError(null);
                try {
                    blob = await api
                        .post("/api/tts", {
                            json: { text: narrationText },
                            signal,
                            timeout: 60_000,
                        })
                        .blob();
                    if (signal?.aborted) return;
                    track("tts_response_received", {
                        cache_hit: false,
                        text_length_bucket: textLengthBucket,
                    });
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
        [narrationText],
    );

    // Auto-play once per drill when the pref is on. The AbortController
    // cancels an in-flight fetch if the effect re-runs (e.g. Strict Mode
    // double-mount in dev), preventing overlapping audio streams.
    useEffect(() => {
        if (!autoPlay) return;
        if (!autoplayEnabled) return;
        if (!narrationText) return;
        if (autoplayAttemptedRef.current) return;
        autoplayAttemptedRef.current = true;

        const controller = new AbortController();
        void loadAndPlay(controller.signal);

        return () => {
            controller.abort();
        };
    }, [autoPlay, autoplayEnabled, narrationText, loadAndPlay]);

    async function handleTogglePlayback() {
        if (!narrationText) return;

        if (playbackState === "playing") {
            audioRef.current?.pause();
            setPlaybackState("idle");
            return;
        }

        track("tts_play_clicked", { context: "drill_prompt" });
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
            {narrationText ? (
                <div className="flex flex-wrap items-center justify-end gap-1">
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
                        {playbackState === "playing" ? "Pause" : "Listen"}
                    </Button>
                    {autoPlay ? (
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
                    ) : null}
                </div>
            ) : null}

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
        </div>
    );
}
