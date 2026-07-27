import { describe, expect, it } from "vitest";

import {
  INPUT_AXIS_LEVELS,
  axisToInt8,
  int8ToAxis,
  quantizeAxis,
  quantizeCarInput
} from "@/netcode/InputQuantize";
import { NEUTRAL_CAR_INPUT, type CarInput } from "@/physics/PhysicsTypes";

/**
 * N1 (plan/ONLINE_MULTIPLAYER_PLAN.md, §4.3): the local sim must consume
 * exactly the value that would survive the int8 wire encoding, or two
 * peers desync. These gates pin the quantization grid and the round-trip
 * identity the N2 codec depends on.
 */
describe("input quantization (multiplayer wire grid)", () => {
  it("represents full deflection and neutral exactly", () => {
    expect(quantizeAxis(0)).toBe(0);
    expect(quantizeAxis(1)).toBe(1);
    expect(quantizeAxis(-1)).toBe(-1);
    expect(axisToInt8(1)).toBe(INPUT_AXIS_LEVELS);
    expect(axisToInt8(-1)).toBe(-INPUT_AXIS_LEVELS);
    expect(axisToInt8(0)).toBe(0);
  });

  it("clamps out-of-range and NaN inputs into the grid", () => {
    expect(quantizeAxis(5)).toBe(1);
    expect(quantizeAxis(-5)).toBe(-1);
    expect(quantizeAxis(Number.NaN)).toBe(0);
    expect(axisToInt8(2)).toBe(INPUT_AXIS_LEVELS);
    expect(int8ToAxis(500)).toBe(1);
    expect(int8ToAxis(-500)).toBe(-1);
  });

  it("quantizeAxis is idempotent and matches the int8 round trip", () => {
    for (let raw = -1; raw <= 1; raw += 0.001) {
      const q = quantizeAxis(raw);
      // Already-quantized values survive the int8 round trip exactly.
      expect(int8ToAxis(axisToInt8(q))).toBeCloseTo(q, 12);
      // And quantizing an already-quantized value is a fixed point.
      expect(quantizeAxis(q)).toBe(q);
    }
  });

  it("int8 -> float -> int8 is the identity across the whole grid", () => {
    for (let encoded = -INPUT_AXIS_LEVELS; encoded <= INPUT_AXIS_LEVELS; encoded += 1) {
      expect(axisToInt8(int8ToAxis(encoded))).toBe(encoded);
    }
  });

  it("quantizeCarInput quantizes analog axes and leaves buttons untouched", () => {
    const raw: CarInput = {
      throttle: 0.333333,
      steer: -0.7,
      pitch: 0.123456,
      yaw: -0.999,
      roll: 0.5,
      jump: true,
      boost: false,
      powerslide: true
    };
    const q = quantizeCarInput(raw);
    expect(q.jump).toBe(true);
    expect(q.boost).toBe(false);
    expect(q.powerslide).toBe(true);
    for (const axis of ["throttle", "steer", "pitch", "yaw", "roll"] as const) {
      expect(q[axis]).toBe(quantizeAxis(raw[axis]));
      // The quantized value is on the grid: an exact multiple of 1/127.
      expect(Math.round(q[axis] * INPUT_AXIS_LEVELS)).toBeCloseTo(q[axis] * INPUT_AXIS_LEVELS, 9);
    }
  });

  it("a neutral input quantizes to itself", () => {
    expect(quantizeCarInput(NEUTRAL_CAR_INPUT)).toEqual(NEUTRAL_CAR_INPUT);
  });
});
