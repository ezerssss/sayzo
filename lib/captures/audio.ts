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
 * Per-channel RMS energy envelope. Used by `retranscribeCapture` to
 *  (a) detect dead channels (skip work on a silent side), and
 *  (b) tag each Whisper segment's speaker by comparing left-vs-right
 *      energy during that segment's time window — the left channel is
 *      the user mic and the right channel is the system audio tap, so
 *      whichever side was louder in a given window is the speaker.
 *
 * Values are 0..1 full-scale. Binned envelope keeps memory bounded
 * (~600 KB for a 60-min capture at 50 ms bins) while allowing O(bins)
 * windowed RMS queries for each Whisper segment.
 */
export type ChannelEnergy = {
    totalMs: number;
    maxLeftRms: number;
    maxRightRms: number;
    binMs: number;
    leftRmsBins: Float32Array;
    rightRmsBins: Float32Array;
};

const ENERGY_SAMPLE_RATE = 16000;
const ENERGY_BIN_MS = 50;
const SAMPLES_PER_BIN = (ENERGY_SAMPLE_RATE * ENERGY_BIN_MS) / 1000;

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

        let maxLeft = 0;
        let maxRight = 0;
        let sampleCount = 0;
        let residual = Buffer.alloc(0);
        let binSampleCount = 0;
        let binSumSqLeft = 0;
        let binSumSqRight = 0;
        const leftBins: number[] = [];
        const rightBins: number[] = [];

        let stderr = "";
        let settled = false;
        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
            const data =
                residual.length > 0 ? Buffer.concat([residual, chunk]) : chunk;
            const fullLen = data.length - (data.length % 4);
            residual =
                fullLen < data.length
                    ? Buffer.from(data.subarray(fullLen))
                    : Buffer.alloc(0);

            for (let i = 0; i < fullLen; i += 4) {
                const l = data.readInt16LE(i) / 32768;
                const r = data.readInt16LE(i + 2) / 32768;
                const la = Math.abs(l);
                const ra = Math.abs(r);
                if (la > maxLeft) maxLeft = la;
                if (ra > maxRight) maxRight = ra;
                binSumSqLeft += l * l;
                binSumSqRight += r * r;
                binSampleCount++;
                sampleCount++;

                if (binSampleCount >= SAMPLES_PER_BIN) {
                    leftBins.push(Math.sqrt(binSumSqLeft / binSampleCount));
                    rightBins.push(Math.sqrt(binSumSqRight / binSampleCount));
                    binSumSqLeft = 0;
                    binSumSqRight = 0;
                    binSampleCount = 0;
                }
            }
        });

        ffmpeg.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on("close", (code) => {
            settle(() => {
                if (code === 0) {
                    if (binSampleCount > 0) {
                        leftBins.push(
                            Math.sqrt(binSumSqLeft / binSampleCount),
                        );
                        rightBins.push(
                            Math.sqrt(binSumSqRight / binSampleCount),
                        );
                    }
                    resolve({
                        totalMs: (sampleCount / ENERGY_SAMPLE_RATE) * 1000,
                        maxLeftRms: maxLeft,
                        maxRightRms: maxRight,
                        binMs: ENERGY_BIN_MS,
                        leftRmsBins: Float32Array.from(leftBins),
                        rightRmsBins: Float32Array.from(rightBins),
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

// ---------------------------------------------------------------------------
// Windowed energy + mono downmix for Whisper
// ---------------------------------------------------------------------------

/**
 * Average RMS on each channel over the given time window. Used to tag a
 * Whisper segment's speaker: whichever channel was louder during the
 * segment's [start, end] is the speaker (left = user mic, right = system
 * audio).
 */
export function rmsInWindow(
    energy: ChannelEnergy,
    startSecs: number,
    endSecs: number,
): { left: number; right: number } {
    const totalBins = energy.leftRmsBins.length;
    if (totalBins === 0) return { left: 0, right: 0 };

    const startBin = Math.max(
        0,
        Math.floor((startSecs * 1000) / energy.binMs),
    );
    const endBin = Math.min(
        totalBins,
        Math.max(startBin + 1, Math.ceil((endSecs * 1000) / energy.binMs)),
    );
    const n = endBin - startBin;
    if (n <= 0) return { left: 0, right: 0 };

    let leftSumSq = 0;
    let rightSumSq = 0;
    for (let i = startBin; i < endBin; i++) {
        const l = energy.leftRmsBins[i];
        const r = energy.rightRmsBins[i];
        leftSumSq += l * l;
        rightSumSq += r * r;
    }
    return {
        left: Math.sqrt(leftSumSq / n),
        right: Math.sqrt(rightSumSq / n),
    };
}

/**
 * Downmix stereo → mono + highpass + loudness-normalize, encode as OGG
 * Opus at 48 kbps for Whisper. Unlike per-channel isolation, the mono
 * mix preserves full conversation context (both speakers), which
 * Whisper relies on to decode reliably — isolated mono starves the
 * sequence model and causes it to miss whole sentences. Speaker
 * identity is recovered after the fact from per-channel energy via
 * `rmsInWindow()`.
 */
export async function extractMixedMonoOpusForWhisper(
    stereoBuffer: Buffer,
): Promise<Buffer> {
    const ffmpegPath = getFfmpegPath();
    const filterChain = "highpass=f=80,loudnorm=I=-16:LRA=11:TP=-1.5";

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-ac",
            "1",
            "-af",
            filterChain,
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
