"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const BAR_COUNT = 40;
const IDLE_BAR =
    "w-[3px] rounded-full bg-sky-200/70 transition-[height] duration-100";
const idleHeight = (i: number) => `${14 + ((i * 13) % 16)}%`;

interface PropsInterface {
    stream: MediaStream | null;
    active: boolean;
    className?: string;
}

/**
 * Live mic waveform — a centered equalizer of thin rounded bars (sky at rest,
 * blue while speaking), styled to match the desktop agent's HUD waveform. No
 * boxy container; the bars sit cleanly on whatever surface holds them.
 */
export function LiveWaveform(props: Readonly<PropsInterface>) {
    const { stream, active, className } = props;
    const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const rafRef = useRef<number>(0);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        // Reset to the calm resting state whenever we stop.
        barRefs.current.forEach((el, i) => {
            if (!el) return;
            el.style.height = idleHeight(i);
            el.className = IDLE_BAR;
        });

        if (!stream || !active) return;

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
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(data);
            for (let i = 0; i < BAR_COUNT; i++) {
                const el = barRefs.current[i];
                if (!el) continue;
                const bin = Math.min(
                    data.length - 1,
                    Math.floor((i / BAR_COUNT) * data.length),
                );
                const v = data[bin] ?? 0;
                const norm = v / 255;
                el.style.height = `${14 + norm * 82}%`;
                el.className = cn(
                    "w-[3px] rounded-full transition-[height] duration-100",
                    norm > 0.08 ? "bg-blue-600" : "bg-sky-200/70",
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
                "flex h-12 items-center justify-between gap-px",
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
                    className={IDLE_BAR}
                    style={{ height: idleHeight(i) }}
                />
            ))}
        </div>
    );
}
