"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
    src: string;
    className?: string;
    audioRef?: React.RefObject<HTMLAudioElement | null>;
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, className, audioRef: externalRef }: AudioPlayerProps) {
    const internalRef = useRef<HTMLAudioElement | null>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const resolvingDurationRef = useRef(false);

    const audio = internalRef.current;

    // Sync internal ref with external ref
    const setRef = useCallback(
        (el: HTMLAudioElement | null) => {
            internalRef.current = el;
            if (externalRef) {
                (externalRef as React.MutableRefObject<HTMLAudioElement | null>).current = el;
            }
        },
        [externalRef],
    );

    // Resolve duration for WebM files that report Infinity
    const resolveDuration = useCallback((el: HTMLAudioElement) => {
        if (resolvingDurationRef.current) return;
        if (Number.isFinite(el.duration) && el.duration > 0) {
            setDuration(el.duration);
            setIsLoading(false);
            return;
        }

        // WebM hack: seek to a large time to force the browser to determine real duration
        resolvingDurationRef.current = true;
        const onTimeUpdate = () => {
            if (Number.isFinite(el.duration) && el.duration > 0) {
                setDuration(el.duration);
                el.removeEventListener("timeupdate", onTimeUpdate);
                el.currentTime = 0;
                resolvingDurationRef.current = false;
                setIsLoading(false);
            }
        };
        el.addEventListener("timeupdate", onTimeUpdate);
        el.currentTime = 1e10; // Seek to "end"
    }, []);

    useEffect(() => {
        const el = internalRef.current;
        if (!el) return;

        const onLoadedMetadata = () => resolveDuration(el);
        const onTimeUpdate = () => {
            if (!resolvingDurationRef.current && !isDragging) {
                setCurrentTime(el.currentTime);
            }
        };
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => {
            setIsPlaying(false);
            setCurrentTime(0);
        };
        const onDurationChange = () => {
            if (
                !resolvingDurationRef.current &&
                Number.isFinite(el.duration) &&
                el.duration > 0
            ) {
                setDuration(el.duration);
            }
        };

        el.addEventListener("loadedmetadata", onLoadedMetadata);
        el.addEventListener("timeupdate", onTimeUpdate);
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("ended", onEnded);
        el.addEventListener("durationchange", onDurationChange);

        // If metadata already loaded
        if (el.readyState >= 1) {
            resolveDuration(el);
        }

        return () => {
            el.removeEventListener("loadedmetadata", onLoadedMetadata);
            el.removeEventListener("timeupdate", onTimeUpdate);
            el.removeEventListener("play", onPlay);
            el.removeEventListener("pause", onPause);
            el.removeEventListener("ended", onEnded);
            el.removeEventListener("durationchange", onDurationChange);
        };
    }, [src, resolveDuration, isDragging]);

    const togglePlay = () => {
        const el = internalRef.current;
        if (!el) return;
        if (isPlaying) {
            el.pause();
        } else {
            void el.play();
        }
    };

    const seekTo = (fraction: number) => {
        const el = internalRef.current;
        if (!el || !duration) return;
        el.currentTime = fraction * duration;
        setCurrentTime(el.currentTime);
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = progressRef.current?.getBoundingClientRect();
        if (!rect) return;
        const fraction = Math.max(
            0,
            Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        seekTo(fraction);
    };

    const handleProgressDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
        const rect = progressRef.current?.getBoundingClientRect();
        if (!rect) return;

        const onMove = (ev: PointerEvent) => {
            const fraction = Math.max(
                0,
                Math.min(1, (ev.clientX - rect.left) / rect.width),
            );
            setCurrentTime(fraction * duration);
        };
        const onUp = (ev: PointerEvent) => {
            const fraction = Math.max(
                0,
                Math.min(1, (ev.clientX - rect.left) / rect.width),
            );
            seekTo(fraction);
            setIsDragging(false);
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    };

    const progress = duration > 0 ? currentTime / duration : 0;

    return (
        <div
            className={cn(
                "flex items-center gap-3 rounded-xl border border-border/70 px-4 py-3",
                className,
            )}
        >
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={togglePlay}
                disabled={isLoading}
            >
                {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                ) : isPlaying ? (
                    <Pause className="size-4" />
                ) : (
                    <Play className="size-4" />
                )}
            </Button>

            <span className="min-w-[3ch] text-sm tabular-nums text-muted-foreground">
                {formatTime(currentTime)}
            </span>

            <div
                ref={progressRef}
                className="relative flex-1 cursor-pointer py-2"
                onClick={handleProgressClick}
                onPointerDown={handleProgressDrag}
            >
                <div className="h-1 rounded-full bg-border">
                    <div
                        className="h-full rounded-full bg-foreground transition-[width] duration-75"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
                <div
                    className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-foreground"
                    style={{ left: `calc(${progress * 100}% - 6px)` }}
                />
            </div>

            <span className="min-w-[3ch] text-sm tabular-nums text-muted-foreground">
                {formatTime(duration)}
            </span>

            <audio ref={setRef} src={src} preload="metadata">
                <track
                    kind="captions"
                    label="English captions"
                    srcLang="en"
                    default
                />
            </audio>
        </div>
    );
}
