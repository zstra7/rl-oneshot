import { describe, expect, it } from "vitest";

import { flipRate, peakFlipRate } from "@/physics/car/DodgeRateProfile";

/**
 * G7.a (plan/GAME_ENHANCEMENTS_PLAN.md): the flip's angular rate profile is
 * front-loaded (peaks immediately, eases down through the back half)
 * instead of a constant metronome rate, so a full flip still lands
 * wheels-down (integral == 2*PI) but the finish is smooth rather than an
 * instant snap to zero.
 */
describe("G7.a flipRate", () => {
  const activeDuration = 0.65;

  it("numerically integrates to 2*PI within 1% over [0, activeDuration]", () => {
    const steps = 120 * activeDuration; // one physics tick's worth of resolution
    const dt = activeDuration / steps;
    let integral = 0;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) * dt; // midpoint rule
      integral += flipRate(t, activeDuration) * dt;
    }
    expect(integral).toBeCloseTo(2 * Math.PI, 1);
    expect(Math.abs(integral - 2 * Math.PI) / (2 * Math.PI)).toBeLessThan(0.01);
  });

  it("is front-loaded: the rate at t=0 is higher than near the end", () => {
    const rateAtStart = flipRate(0, activeDuration);
    const rateNearEnd = flipRate(activeDuration * 0.99, activeDuration);
    expect(rateAtStart).toBeGreaterThan(rateNearEnd);
  });

  it("holds the peak rate for the front-loaded fraction, then ramps down to ~25% of peak by the end", () => {
    const peak = peakFlipRate(activeDuration);
    expect(flipRate(0, activeDuration)).toBeCloseTo(peak, 5);
    expect(flipRate(activeDuration * 0.5, activeDuration)).toBeCloseTo(peak, 5);
    expect(flipRate(activeDuration, activeDuration)).toBeCloseTo(peak * 0.25, 5);
  });

  it("is monotonic non-increasing over the full duration", () => {
    const samples = 50;
    let previous = flipRate(0, activeDuration);
    for (let i = 1; i <= samples; i += 1) {
      const t = (i / samples) * activeDuration;
      const rate = flipRate(t, activeDuration);
      expect(rate).toBeLessThanOrEqual(previous + 1e-9);
      previous = rate;
    }
  });

  it("holds for a different activeDuration too (integral scales, still 2*PI)", () => {
    const duration = 0.4;
    const steps = 200;
    const dt = duration / steps;
    let integral = 0;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) * dt;
      integral += flipRate(t, duration) * dt;
    }
    expect(Math.abs(integral - 2 * Math.PI) / (2 * Math.PI)).toBeLessThan(0.01);
  });
});
