import { describe, expect, it } from "vitest";

import {
  CORRECTION_HALF_LIFE_SECONDS,
  CORRECTION_MAX_ACCEPTED_DISTANCE,
  decayOffset,
  shouldSmoothCorrection
} from "@/integration/CorrectionOffset";
import * as V from "@/physics/Vec3Math";

describe("P1.2 CorrectionOffset (pure decay/clamp policy)", () => {
  it("decays a small offset below 1cm within 300ms of simulated frames", () => {
    let offset = { x: 0.3, y: 0, z: 0 };
    const frameDt = 1 / 120; // 120Hz fixed-step-driven render frames
    const totalFrames = Math.round(0.3 / frameDt);
    for (let i = 0; i < totalFrames; i += 1) {
      offset = decayOffset(offset, frameDt, CORRECTION_HALF_LIFE_SECONDS);
    }
    expect(V.length(offset)).toBeLessThan(0.01);
  });

  it("halves the offset magnitude after exactly one half-life", () => {
    const offset = { x: 1, y: 0, z: 0 };
    const decayed = decayOffset(offset, CORRECTION_HALF_LIFE_SECONDS, CORRECTION_HALF_LIFE_SECONDS);
    expect(V.length(decayed)).toBeCloseTo(0.5, 5);
  });

  it("leaves the offset unchanged for a non-positive dt", () => {
    const offset = { x: 1, y: 2, z: 3 };
    expect(decayOffset(offset, 0)).toEqual(offset);
    expect(decayOffset(offset, -1)).toEqual(offset);
  });

  it("accepts a small correction delta and rejects a large one (real teleport)", () => {
    expect(shouldSmoothCorrection({ x: 0.3, y: 0, z: 0 })).toBe(true);
    expect(shouldSmoothCorrection({ x: CORRECTION_MAX_ACCEPTED_DISTANCE, y: 0, z: 0 })).toBe(true);
    expect(shouldSmoothCorrection({ x: 2.0, y: 0, z: 0 })).toBe(false);
    expect(shouldSmoothCorrection({ x: 0, y: 0, z: 0 })).toBe(true);
  });
});
