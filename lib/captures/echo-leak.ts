// Echo-leak suppression for stereo captures.
//
// On-device `echo_guard` (desktop agent) catches most echoes, but the agent
// isn't WebRTC-routed — residuals reaching the server are set by acoustics.
// Laptop-speakers-near-mic gives k≈0.5-0.8 → right/left amplitude ratio of
// 1.2-2.0, so 2.0 is the lowest we can go without risking real-user false
// drops. Also catches Deepgram c0 hallucinations emitted on spans that
// `echo_guard` zeroed out (cosine-tapered silence) via the meanLeft==0
// branch in `isEchoLeakUtterance`.
//
// DO NOT add a text-similarity check against concurrent c1 utterances.
// Sayzo's coaching depends on capturing reiteration / mirroring /
// pronunciation practice — "user text that matches c1 text closely, at
// near-simultaneous timing" is exactly what text-similarity would drop.
// If echo leakage becomes bad enough that overlap + ratio tuning can't
// fix it, improve the agent-side `echo_guard`, not the server.

export const ECHO_RIGHT_OVER_LEFT_RATIO = 2.0;
export const ECHO_VOICED_BIN_FLOOR_RMS = 0.005;
export const ECHO_MIN_UTTERANCE_MS = 200;
export const ECHO_MIN_C1_OVERLAP_FRACTION = 0.6;
export const ECHO_MIN_VOICED_BINS = 3;
export const ECHO_LEAK_RULE_VERSION = "v1";

export type EchoUtteranceWindow = {
    start: number;
    end: number;
};

export type EchoEnergyView = {
    binMs: number;
    leftRmsBins: Float32Array;
    rightRmsBins: Float32Array;
};

export function isEchoLeakUtterance(
    u: EchoUtteranceWindow,
    energy: EchoEnergyView,
    c1Intervals: EchoUtteranceWindow[],
): boolean {
    const durSec = u.end - u.start;
    if (durSec <= 0) return false;
    if (durSec * 1000 < ECHO_MIN_UTTERANCE_MS) return false;

    let overlapSec = 0;
    for (const iv of c1Intervals) {
        const o = Math.max(
            0,
            Math.min(u.end, iv.end) - Math.max(u.start, iv.start),
        );
        overlapSec += o;
    }
    const overlapFrac = Math.min(1, overlapSec / durSec);
    if (overlapFrac < ECHO_MIN_C1_OVERLAP_FRACTION) return false;

    const binMs = energy.binMs;
    const totalBins = energy.leftRmsBins.length;
    const startBin = Math.max(0, Math.floor((u.start * 1000) / binMs));
    const endBin = Math.min(totalBins, Math.ceil((u.end * 1000) / binMs));
    if (endBin <= startBin) return false;

    let leftSum = 0;
    let rightSum = 0;
    let voiced = 0;
    for (let i = startBin; i < endBin; i++) {
        const l = energy.leftRmsBins[i];
        const r = energy.rightRmsBins[i];
        if (Math.max(l, r) < ECHO_VOICED_BIN_FLOOR_RMS) continue;
        leftSum += l;
        rightSum += r;
        voiced++;
    }
    if (voiced < ECHO_MIN_VOICED_BINS) return false;

    const meanLeft = leftSum / voiced;
    const meanRight = rightSum / voiced;

    // Voiced bins exist but left sums to exactly zero: Deepgram transcribed
    // a region of -∞ dBFS silence — a hallucination emitted over a span that
    // echo_guard zeroed out on the agent. Drop. Taper-edge bins fall through
    // to the ratio test below (huge ratio → still drops), so this branch is
    // only exact-silence; RMS ≥ 0 makes <= 0 equivalent to == 0.
    if (meanLeft <= 0) return true;

    return meanRight > meanLeft * ECHO_RIGHT_OVER_LEFT_RATIO;
}
