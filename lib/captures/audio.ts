import "server-only";

import ffmpegStatic from "ffmpeg-static";
import { spawn } from "node:child_process";

/**
 * Extract the left channel (user microphone) from a stereo OGG Opus capture
 * and return it as mono 16-bit PCM WAV.
 *
 * Captures are stereo by design — left = user mic, right = system audio
 * (other speakers). Sending only the left channel to Hume guarantees that
 * prosody and burst signals are user-only, with zero contamination from the
 * other side of the call. The simpler "send mixed audio + filter by speaker
 * timestamps in the LLM" approach can't handle overlapping speech and
 * depends on brittle timestamp arithmetic.
 *
 * Uses `ffmpeg-static` so the binary ships with `node_modules` — no system
 * ffmpeg required, no setup steps for new droplets / dev machines / CI.
 *
 * Memory note: WAV is uncompressed (~115 MB worst case for a 60-min capture
 * at 16 kHz mono 16-bit). Acceptable on the droplet but worth knowing.
 */
export async function extractUserChannel(
    stereoOggBuffer: Buffer,
): Promise<Buffer> {
    const ffmpegPath = ffmpegStatic;
    if (!ffmpegPath) {
        throw new Error(
            "ffmpeg-static binary path is missing. Reinstall the package.",
        );
    }

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, [
            "-loglevel",
            "error", // suppress chatty progress; only real errors land on stderr
            "-i",
            "pipe:0", // read input from stdin
            "-af",
            "pan=mono|c0=c0", // mono output where channel 0 = input left channel
            "-f",
            "wav",
            "pipe:1", // write output to stdout
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

        ffmpeg.stdin.write(stereoOggBuffer);
        ffmpeg.stdin.end();
    });
}
