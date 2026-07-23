import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/**
 * R10.3 (plan/RAMPS_AND_FEATURES_PLAN.md): air-roll sensitivity is a
 * per-car CarControlProfile multiplier applied to
 * RL_CONSTANTS.maxRollAngularAcceleration in AerialController's roll axis
 * only — physics-real for both digital and analog input, unlike a purely
 * cosmetic/UI-side scaling.
 */
describe("Air-roll sensitivity (R10.3)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  it("a higher sensitivity produces meaningfully more accumulated roll rate for identical input", () => {
    physics.spawnCar({ id: "low", transform: { x: -10, y: 8, z: 0 } });
    physics.spawnCar({ id: "high", transform: { x: 10, y: 8, z: 0 } });

    physics.setCarControlProfile("low", { airRollSensitivity: 0.6 });
    physics.setCarControlProfile("high", { airRollSensitivity: 1.8 });

    const input = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 1, jump: false, boost: false, powerslide: false };
    physics.setCarInput("low", input);
    physics.setCarInput("high", input);

    // Both cars are airborne immediately after spawning at y=8 (nowhere
    // near the arena floor), so applyAerialRotation runs from tick 1.
    //
    // F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): aerial rotation is
    // now integrated directly in velocity-space instead of going through
    // applyTorqueImpulse, so it's ~23x stronger for the same constants.
    // At the old 30-tick sample point BOTH cars now saturate against
    // carMaxAngularSpeed (measured: low=4.69 rad/s, high=5.50 rad/s,
    // capped) -- a real behaviour shift, not a benign one, since the cap
    // compresses the ratio the sensitivity multiplier is supposed to
    // produce. Sampling earlier (10 ticks), before either car reaches the
    // cap, recovers the full, uncompressed 3x ratio the 0.6/1.8
    // sensitivities imply (measured empirically: exactly 3.00x at 10
    // ticks and below).
    physics.stepTicks(10);

    const lowState = physics.getCarState("low");
    const highState = physics.getCarState("high");
    expect(physics.getCarState("low").grounded).toBe(false);
    expect(physics.getCarState("high").grounded).toBe(false);

    const lowAngularSpeed = V.length(lowState.angularVelocity);
    const highAngularSpeed = V.length(highState.angularVelocity);

    // Measured empirically at exactly 3.00x (the full 1.8/0.6 sensitivity
    // ratio, uncompressed by the angular-speed cap) at 10 ticks; 2.5x is a
    // safe, non-flaky threshold below what was observed.
    expect(highAngularSpeed).toBeGreaterThan(lowAngularSpeed * 2.5);
    expect(lowAngularSpeed).toBeGreaterThan(0);
  });

  it("defaults to sensitivity 1.0 (unchanged historical roll behaviour) when unset", () => {
    physics.spawnCar({ id: "default", transform: { x: 0, y: 8, z: 0 } });
    physics.setCarInput("default", {
      throttle: 0,
      steer: 0,
      pitch: 0,
      yaw: 0,
      roll: 1,
      jump: false,
      boost: false,
      powerslide: false
    });
    physics.stepTicks(1);
    const angularSpeed = V.length(physics.getCarState("default").angularVelocity);
    expect(angularSpeed).toBeGreaterThan(0);
  });
});
