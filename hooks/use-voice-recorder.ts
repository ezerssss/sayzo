"use client";

import { useCallback, useRef, useState } from "react";

function pickRecorderMimeType(): string | undefined {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return undefined;
}

export interface VoiceRecorderResult {
    blob: Blob;
    mimeType: string;
}

export function useVoiceRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const stopTracks = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStream(null);
    }, []);

    const stop = useCallback(async (): Promise<VoiceRecorderResult | null> => {
        setIsRecording(false);
        const mr = mediaRecorderRef.current;
        mediaRecorderRef.current = null;

        if (!mr || mr.state === "inactive") {
            stopTracks();
            return null;
        }

        return new Promise((resolve) => {
            mr.onstop = () => {
                const mimeType = mr.mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type: mimeType });
                chunksRef.current = [];
                stopTracks();
                resolve({ blob, mimeType });
            };
            mr.stop();
        });
    }, [stopTracks]);

    const start = useCallback(async () => {
        setError(null);
        try {
            const s = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            streamRef.current = s;
            setStream(s);

            const mimeType = pickRecorderMimeType();
            const mr = mimeType
                ? new MediaRecorder(s, { mimeType })
                : new MediaRecorder(s);
            chunksRef.current = [];
            mr.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            mr.start(250);
            mediaRecorderRef.current = mr;
            setIsRecording(true);
        } catch (e) {
            stopTracks();
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not access the microphone.",
            );
        }
    }, [stopTracks]);

    return {
        isRecording,
        stream,
        error,
        start,
        stop,
        clearError: () => setError(null),
    };
}
