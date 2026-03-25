"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const BAR_COUNT = 24;

interface PropsInterface {
    stream: MediaStream | null;
    active: boolean;
    className?: string;
}

export function LiveWaveform(props: Readonly<PropsInterface>) {
    const { stream, active, className } = props;
    const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const rafRef = useRef<number>(0);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        barRefs.current.forEach((el, i) => {
            if (!el) {
                return;
            }
            el.style.height = `${12 + ((i * 17) % 20)}%`;
            el.className = cn(
                "w-1 rounded-full bg-foreground/25 transition-[height] duration-75",
            );
        });

        if (!stream || !active) {
            return;
        }

        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceRef.current = source;

        void audioContext.resume();
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
            if (!analyserRef.current) {
                return;
            }
            analyserRef.current.getByteFrequencyData(data);
            for (let i = 0; i < BAR_COUNT; i++) {
                const el = barRefs.current[i];
                if (!el) {
                    continue;
                }
                const bin = Math.min(
                    data.length - 1,
                    Math.floor((i / BAR_COUNT) * data.length),
                );
                const v = data[bin] ?? 0;
                const norm = v / 255;
                const heightPct = 14 + norm * 78;
                el.style.height = `${heightPct}%`;
                el.className = cn(
                    "w-1 rounded-full transition-[height] duration-75",
                    norm > 0.08 ? "bg-primary/85" : "bg-foreground/30",
                );
            }
            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafRef.current);
            sourceRef.current?.disconnect();
            sourceRef.current = null;
            analyserRef.current = null;
            void audioContext.close();
        };
    }, [stream, active]);

    return (
        <div
            className={cn(
                "flex h-14 items-end justify-center gap-0.5 rounded-xl border border-border/80 bg-muted/40 px-3 py-2",
                className,
            )}
            aria-hidden
        >
            {Array.from({ length: BAR_COUNT }, (_, i) => (
                <span
                    key={i}
                    ref={(el) => {
                        barRefs.current[i] = el;
                    }}
                    className="w-1 rounded-full bg-foreground/25 transition-[height] duration-75"
                    style={{ height: `${12 + ((i * 17) % 20)}%` }}
                />
            ))}
        </div>
    );
}
