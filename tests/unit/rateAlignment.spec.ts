import { describe, expect, it } from "vitest";

import { computeRateScale, computeTargetLeadTicks } from "@/netcode/RateAlignment";

describe("P1.3 RateAlignment (pure guest tick-rate policy)", () => {
  it("computeRateScale returns exactly 1.0 at the target lead", () => {
    expect(computeRateScale(4, 4)).toBeCloseTo(1.0, 10);
    expect(computeRateScale(10, 10)).toBeCloseTo(1.0, 10);
  });

  it("computeRateScale is > 1 (run faster) when behind the target lead", () => {
    expect(computeRateScale(2, 6)).toBeGreaterThan(1.0);
  });

  it("computeRateScale is < 1 (run slower) when ahead of the target lead", () => {
    expect(computeRateScale(10, 4)).toBeLessThan(1.0);
  });

  it("clamps the adjustment to ±3% for any lead gap", () => {
    expect(computeRateScale(-1000, 1000)).toBeCloseTo(1.03, 5);
    expect(computeRateScale(1000, -1000)).toBeCloseTo(0.97, 5);
  });

  it("computeTargetLeadTicks falls back to a sane default before RTT is measured", () => {
    expect(computeTargetLeadTicks(null)).toBe(4);
  });

  it("computeTargetLeadTicks scales with RTT and stays within [2, 12]", () => {
    const low = computeTargetLeadTicks(10);
    const mid = computeTargetLeadTicks(150);
    const high = computeTargetLeadTicks(5000);
    expect(low).toBeGreaterThanOrEqual(2);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBe(12);
  });
});
