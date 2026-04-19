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
 * Extract a single channel as mono OGG Opus with loudness normalization
 * applied. Used for per-channel Whisper transcription.
 *
 * Why normalization: when a channel is extracted to isolated mono, quiet
 * stretches (e.g. a user mic recorded at low gain while the other side
 * speaks via system audio) give Whisper very little signal to anchor to,
 * and it defaults to YouTube-subtitle-style hallucinations ("if you have
 * any questions, please post them in the comments section below"). A
 * loudness-normalized mono track keeps real speech at a consistent level
 * that Whisper can transcribe reliably.
 *
 * Filter chain:
 * - `pan=mono|c0=cX` — select the channel
 * - `highpass=f=80` — remove sub-speech rumble (HVAC, desk thumps)
 * - `loudnorm=I=-16:LRA=11:TP=-1.5` — EBU R128 single-pass loudness
 *   normalization to streaming target. Safer than `dynaudnorm` on silent
 *   stretches because it targets integrated loudness, not local gain.
 *
 * Output: mono OGG Opus at 48 kbps — voice-transparent, fits 60 min in
 * ~22 MB (well under Whisper's 25 MB request limit).
 */
export async function extractChannelAsMonoOpusForWhisper(
    stereoBuffer: Buffer,
    channel: "left" | "right",
): Promise<Buffer> {
    const ffmpegPath = getFfmpegPath();
    const channelIdx = channel === "left" ? "c0" : "c1";
    const filterChain =
        `pan=mono|c0=${channelIdx},` +
        `highpass=f=80,` +
        `loudnorm=I=-16:LRA=11:TP=-1.5`;

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
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

/**
 * Per-channel RMS energy envelope — used by `retranscribeCapture` to
 * detect dead channels (skip Whisper if the whole channel is silent).
 *
 * Values are 0..1 full-scale. Streaming sample processing keeps peak
 * memory at ~one chunk even for 60-min captures (230 MB of decoded PCM).
 */
export type ChannelEnergy = {
    totalMs: number;
    maxLeftRms: number;
    maxRightRms: number;
};

const ENERGY_SAMPLE_RATE = 16000;

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
                const l = Math.abs(data.readInt16LE(i)) / 32768;
                const r = Math.abs(data.readInt16LE(i + 2)) / 32768;
                if (l > maxLeft) maxLeft = l;
                if (r > maxRight) maxRight = r;
                sampleCount++;
            }
        });

        ffmpeg.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on("close", (code) => {
            settle(() => {
                if (code === 0) {
                    resolve({
                        totalMs: (sampleCount / ENERGY_SAMPLE_RATE) * 1000,
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

