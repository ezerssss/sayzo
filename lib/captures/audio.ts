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
