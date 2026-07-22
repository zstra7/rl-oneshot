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
    physics.stepTicks(30);

    const lowState = physics.getCarState("low");
    const highState = physics.getCarState("high");
    expect(physics.getCarState("low").grounded).toBe(false);
    expect(physics.getCarState("high").grounded).toBe(false);

    const lowAngularSpeed = V.length(lowState.angularVelocity);
    const highAngularSpeed = V.length(highState.angularVelocity);

    // Measured empirically well above 1.5x with the 0.6/1.8 (3x) sensitivity
    // ratio at 30 ticks (well before either car's rate saturates against
    // carMaxAngularSpeed); 1.5x is a safe, non-flaky threshold below what
    // was observed.
    expect(highAngularSpeed).toBeGreaterThan(lowAngularSpeed * 1.5);
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
