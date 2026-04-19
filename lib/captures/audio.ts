import "server-only";

import { spawn } from "node:child_process";
import { join } from "node:path";

/**
 * Extract a single channel from a stereo OGG Opus capture as mono WAV.
 *
 * Captures are stereo by design — left (c0) = user mic, right (c1) = system
 * audio (other speakers). Splitting by channel is the most reliable way to
 * identify who said what — no timestamp overlap heuristics needed.
 *
 * Uses `ffmpeg-static` so the binary ships with `node_modules`.
 */
function getFfmpegPath(): string {
    // Resolve at runtime via process.cwd() to avoid Next.js bundler replacing
    // the path with a build-time placeholder (\ROOT\...). The ffmpeg-static
    // package puts the binary at node_modules/ffmpeg-static/ffmpeg[.exe].
    const ext = process.platform === "win32" ? ".exe" : "";
    const candidate = join(
        process.cwd(),
        "node_modules",
        "ffmpeg-static",
        `ffmpeg${ext}`,
    );
    return candidate;
}

export async function extractChannel(
    stereoBuffer: Buffer,
    channel: "left" | "right",
): Promise<Buffer> {
    const ffmpegPath = getFfmpegPath();

    const channelIdx = channel === "left" ? "c0" : "c1";

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-af",
            `pan=mono|c0=${channelIdx}`,
            "-f",
            "wav",
            "pipe:1",
        ]);

        const chunks: Buffer[] = [];
        let stderr = "";
        let settled = false;

        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
        ffmpeg.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on("close", (code) => {
            settle(() => {
                if (code === 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(
                        new Error(
                            `ffmpeg exited with code ${code}: ${stderr.slice(-500).trim()}`,
                        ),
                    );
                }
            });
        });

        ffmpeg.on("error", (err) => {
            settle(() =>
                reject(new Error(`ffmpeg failed to start: ${err.message}`)),
            );
        });

        ffmpeg.stdin.on("error", (err) => {
            settle(() =>
                reject(
                    new Error(`ffmpeg stdin write failed: ${err.message}`),
                ),
            );
        });

        ffmpeg.stdin.write(stereoBuffer);
        ffmpeg.stdin.end();
    });
}

/** Convenience alias — extracts the user's mic channel (left). */
export async function extractUserChannel(
    stereoOggBuffer: Buffer,
): Promise<Buffer> {
    return extractChannel(stereoOggBuffer, "left");
}

/**
 * Extract a single channel as mono OGG Opus (not WAV).
 *
 * Used for per-channel Whisper transcription: Whisper's request limit is
 * 25 MB, and mono 48 kHz 16-bit WAV is 5.76 MB/min — 60-min captures would
 * blow past the limit. Mono Opus at 48 kbps is voice-transparent and keeps
 * a 60-min channel at ~22 MB.
 */
export async function extractChannelAsMonoOpus(
    stereoBuffer: Buffer,
    channel: "left" | "right",
): Promise<Buffer> {
    const ffmpegPath = getFfmpegPath();
    const channelIdx = channel === "left" ? "c0" : "c1";

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-af",
            `pan=mono|c0=${channelIdx}`,
            "-c:a",
            "libopus",
            "-b:a",
            "48k",
            "-f",
            "ogg",
            "pipe:1",
        ]);

        const chunks: Buffer[] = [];
        let stderr = "";
        let settled = false;

        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
        ffmpeg.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on("close", (code) => {
            settle(() => {
                if (code === 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(
                        new Error(
                            `ffmpeg exited with code ${code}: ${stderr.slice(-500).trim()}`,
                        ),
                    );
                }
            });
        });

        ffmpeg.on("error", (err) => {
            settle(() =>
                reject(new Error(`ffmpeg failed to start: ${err.message}`)),
            );
        });

        ffmpeg.stdin.on("error", (err) => {
            settle(() =>
                reject(
                    new Error(`ffmpeg stdin write failed: ${err.message}`),
                ),
            );
        });

        ffmpeg.stdin.write(stereoBuffer);
        ffmpeg.stdin.end();
    });
}

/**
 * Per-channel RMS energy envelope for a stereo capture, used by the speaker
 * tagger to (a) detect a dead channel (system-audio tap failed → right side
 * silent the whole capture) and (b) cross-check Whisper hallucinations
 * against actual signal on the channel they were transcribed from.
 *
 * RMS values are 0..1 full-scale (int16 divided by 32768 after sqrt).
 */
export type ChannelEnergy = {
    binMs: number;
    leftRms: Float32Array;
    rightRms: Float32Array;
    totalMs: number;
    maxLeftRms: number;
    maxRightRms: number;
};

const ENERGY_SAMPLE_RATE = 16000;
const ENERGY_BIN_MS = 50;
const ENERGY_SAMPLES_PER_BIN =
    (ENERGY_SAMPLE_RATE * ENERGY_BIN_MS) / 1000; // 800 per channel per bin

/**
 * Decode the stereo capture to interleaved 16 kHz s16le PCM and build a
 * coarse (50 ms bin) RMS envelope per channel. Samples are processed in
 * streaming fashion — we never hold the whole decoded PCM in memory (a
 * 60-min stereo capture would be ~230 MB).
 */
export async function computeChannelEnergy(
    stereoBuffer: Buffer,
): Promise<ChannelEnergy> {
    const ffmpegPath = getFfmpegPath();

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-ac",
            "2",
            "-ar",
            String(ENERGY_SAMPLE_RATE),
            "-f",
            "s16le",
            "pipe:1",
        ]);

        const leftRmsValues: number[] = [];
        const rightRmsValues: number[] = [];
        let binSumSqL = 0;
        let binSumSqR = 0;
        let binSamples = 0;
        let maxLeft = 0;
        let maxRight = 0;
        let residual = Buffer.alloc(0);

        let stderr = "";
        let settled = false;
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        const flushBin = () => {
            if (binSamples === 0) return;
            const rmsL = Math.sqrt(binSumSqL / binSamples) / 32768;
            const rmsR = Math.sqrt(binSumSqR / binSamples) / 32768;
            leftRmsValues.push(rmsL);
            rightRmsValues.push(rmsR);
            if (rmsL > maxLeft) maxLeft = rmsL;
            if (rmsR > maxRight) maxRight = rmsR;
            binSumSqL = 0;
            binSumSqR = 0;
            binSamples = 0;
        };

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
            // A stereo s16le frame is 4 bytes (L int16 + R int16). Chunks may
            // split mid-frame, so carry the incomplete tail into the next
            // chunk via `residual`.
            const data =
                residual.length > 0 ? Buffer.concat([residual, chunk]) : chunk;
            const fullLen = data.length - (data.length % 4);
            residual =
                fullLen < data.length
                    ? Buffer.from(data.subarray(fullLen))
                    : Buffer.alloc(0);

            for (let i = 0; i < fullLen; i += 4) {
                const l = data.readInt16LE(i);
                const r = data.readInt16LE(i + 2);
                binSumSqL += l * l;
                binSumSqR += r * r;
                binSamples++;
                if (binSamples >= ENERGY_SAMPLES_PER_BIN) {
                    flushBin();
                }
            }
        });

        ffmpeg.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on("close", (code) => {
            settle(() => {
                if (code === 0) {
                    flushBin(); // flush any partial bin at EOF
                    const leftRms = Float32Array.from(leftRmsValues);
                    const rightRms = Float32Array.from(rightRmsValues);
                    resolve({
                        binMs: ENERGY_BIN_MS,
                        leftRms,
                        rightRms,
                        totalMs: leftRms.length * ENERGY_BIN_MS,
                        maxLeftRms: maxLeft,
                        maxRightRms: maxRight,
                    });
                } else {
                    reject(
                        new Error(
                            `ffmpeg exited with code ${code}: ${stderr.slice(-500).trim()}`,
                        ),
                    );
                }
            });
        });

        ffmpeg.on("error", (err) => {
            settle(() =>
                reject(new Error(`ffmpeg failed to start: ${err.message}`)),
            );
        });

        ffmpeg.stdin.on("error", (err) => {
            settle(() =>
                reject(
                    new Error(`ffmpeg stdin write failed: ${err.message}`),
                ),
            );
        });

        ffmpeg.stdin.write(stereoBuffer);
        ffmpeg.stdin.end();
    });
}

/**
 * Compute RMS over a time window by combining the per-bin RMS values stored
 * in the envelope. Uses the quadratic mean — `sqrt(mean(bin_rms^2))` — which
 * is the correct aggregation when all bins have the same sample count.
 */
export function rmsOverWindow(
    energy: ChannelEnergy,
    startSecs: number,
    endSecs: number,
): { left: number; right: number } {
    const startBin = Math.max(
        0,
        Math.floor((startSecs * 1000) / energy.binMs),
    );
    const endBin = Math.min(
        energy.leftRms.length,
        Math.max(startBin + 1, Math.ceil((endSecs * 1000) / energy.binMs)),
    );
    if (endBin <= startBin) {
        return { left: 0, right: 0 };
    }

    let sumSqL = 0;
    let sumSqR = 0;
    for (let i = startBin; i < endBin; i++) {
        const l = energy.leftRms[i] ?? 0;
        const r = energy.rightRms[i] ?? 0;
        sumSqL += l * l;
        sumSqR += r * r;
    }
    const n = endBin - startBin;
    return {
        left: Math.sqrt(sumSqL / n),
        right: Math.sqrt(sumSqR / n),
    };
}
