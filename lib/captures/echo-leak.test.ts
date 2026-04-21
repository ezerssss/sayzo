import { strictEqual } from "node:assert";
import { test } from "node:test";

import {
    isEchoLeakUtterance,
    type EchoEnergyView,
    type EchoUtteranceWindow,
} from "./echo-leak.ts";

// 1 s utterance = 20 bins at 50 ms.
const BINS_PER_SEC = 20;

function mkEnergy(
    left: number[],
    right: number[],
    binMs = 50,
): EchoEnergyView {
    return {
        binMs,
        leftRmsBins: Float32Array.from(left),
        rightRmsBins: Float32Array.from(right),
    };
}

function fill(n: number, v: number): number[] {
    return Array<number>(n).fill(v);
}

// 1. Pure user turn — left loud, right inaudible, c1 overlap present.
//    Ratio is ~0 → preserve even though the gate passes.
test("pure user turn is preserved even with c1 overlap", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.1),
        fill(BINS_PER_SEC, 0.002),
    );
    const c1 = [{ start: 0, end: 1 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});

// 2. Pure echo — right loud, left just above voiced floor, c1 overlaps.
test("pure echo with strong right-channel dominance is dropped", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.01),
        fill(BINS_PER_SEC, 0.15),
    );
    const c1 = [{ start: 0, end: 1 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), true);
});

// 3. Double-talk — both voiced, ratio 1.5 (< 2.0), c1 overlaps.
test("double-talk under the ratio threshold is preserved", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.1),
        fill(BINS_PER_SEC, 0.15),
    );
    const c1 = [{ start: 0, end: 1 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});

// 4. Hallucination on silence — left is exact zero across voiced bins,
//    right is loud, c1 overlaps. meanLeft == 0 branch → drop.
test("hallucination over agent-zeroed silence is dropped via meanLeft==0", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0),
        fill(BINS_PER_SEC, 0.15),
    );
    const c1 = [{ start: 0, end: 1 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), true);
});

// 5. Loud music on the right, no c1 utterance emitted (music doesn't
//    transcribe). Overlap gate fails → preserve concurrent user speech.
test("loud music on right without a c1 utterance preserves user", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.01),
        fill(BINS_PER_SEC, 0.15),
    );
    const c1: EchoUtteranceWindow[] = [];
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});

// 6. Short utterance (150 ms) with textbook echo signature — length gate
//    rejects before any analysis runs.
test("utterances under 200 ms are not inspected", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 0.15 };
    const energy = mkEnergy(
        fill(3, 0.01), // 3 bins = 150 ms
        fill(3, 0.15),
    );
    const c1 = [{ start: 0, end: 0.15 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});

// 7. Mostly-non-overlap — c0 spans 5 s but only 1 s of c1 overlap (20%).
//    Below the 60% gate → preserve.
test("insufficient c1 overlap preserves the c0 utterance", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 5 };
    const energy = mkEnergy(
        fill(5 * BINS_PER_SEC, 0.01),
        fill(5 * BINS_PER_SEC, 0.15),
    );
    const c1 = [{ start: 0.5, end: 1.5 }]; // 1 s of 5 s = 20%
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});

// 8. Ratio boundary just UNDER threshold (1.9). 80% c1 overlap.
test("ratio just under 2.0 is preserved (boundary: > not >=)", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.05),
        fill(BINS_PER_SEC, 0.095),
    );
    const c1 = [{ start: 0, end: 0.8 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});

// 9. Ratio boundary just OVER threshold (2.1). 80% c1 overlap.
test("ratio just over 2.0 is dropped (boundary)", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.05),
        fill(BINS_PER_SEC, 0.105),
    );
    const c1 = [{ start: 0, end: 0.8 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), true);
});

// 10. Reiteration at meeting volume — user loudly repeats what c1 just said.
//     Both channels voiced at comparable amplitude, 80%+ overlap.
//     Coaching depends on preserving reiteration/mirroring/pronunciation
//     practice. Do not drop. (See echo-leak.ts header comment.)
test("loud reiteration at meeting volume is preserved (core coaching signal)", () => {
    const u: EchoUtteranceWindow = { start: 0, end: 1 };
    const energy = mkEnergy(
        fill(BINS_PER_SEC, 0.12),
        fill(BINS_PER_SEC, 0.12),
    );
    const c1 = [{ start: 0, end: 0.9 }];
    strictEqual(isEchoLeakUtterance(u, energy, c1), false);
});
