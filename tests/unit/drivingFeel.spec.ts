import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { maxCurvature, RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/**
 * WS2 (plan/POLISH_OVERHAUL_PLAN.md): tight, responsive ground handling.
 * Thresholds below are empirically grounded (ad hoc Vitest debugging
 * against the tuned constants), not derived purely from the constants'
 * literal names — the yaw/grip "acceleration" parameters are applied as
 * torque/linear impulses scaled by the car's actual Rapier-computed
 * inertia, so their effective real-world strength isn't 1:1 with their
 * face value. Test windows are also kept short enough that the car never
 * reaches the arena wall (halfLength 30m; at ~14 m/s that's under 2.2s).
 */
describe("Driving feel: grip and steering response", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 1, z: 0 } });
    // WS5.B: the ball now spawns resting at the arena centre (kickoff-
    // accurate) instead of falling from 8m — park it away so it doesn't
    // instantly overlap a car spawned at the origin.
    physics.setBallState({ position: { x: 15, y: 5, z: 25 } });
    physics.stepTicks(90);
  });

  afterEach(() => {
    physics.dispose();
  });

  function yawRate(): number {
    return physics.getCarState("car-a").angularVelocity.y;
  }

  function lateralSpeed(): number {
    const state = physics.getCarState("car-a");
    const right = V.applyQuaternion({ x: 1, y: 0, z: 0 }, state.rotation);
    return V.dot(state.linearVelocity, right);
  }

  it("yaw rate decays smoothly (no overshoot) after releasing steer", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    physics.setCarInput("car-a", { throttle: 1, steer: 1 });
    physics.stepTicks(60);
    const atRelease = Math.abs(yawRate());
    expect(atRelease).toBeGreaterThan(1.5);

    physics.setCarInput("car-a", { throttle: 1, steer: 0 });

    physics.stepTicks(32); // ~0.27s
    const midDecay = Math.abs(yawRate());
    expect(midDecay).toBeLessThan(atRelease * 0.25);

    physics.stepTicks(40); // total ~0.6s
    const lateDecay = Math.abs(yawRate());
    expect(lateDecay).toBeLessThan(0.1);
    // No oscillation past zero: a right turn's yaw rate stays <=0
    // throughout the decay rather than overshooting into a left spin.
    expect(yawRate()).toBeLessThanOrEqual(0);
  });

  it("lateral slide dies out quickly after releasing steer (normal grip, not powerslide)", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    physics.setCarInput("car-a", { throttle: 1, steer: 1 });
    physics.stepTicks(60);
    physics.setCarInput("car-a", { throttle: 1, steer: 0 });

    physics.stepTicks(30); // 0.25s
    expect(Math.abs(lateralSpeed())).toBeLessThan(0.5);
  });

  it("steady-state full-steer yaw rate converges to the curvature-derived target", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    physics.setCarInput("car-a", { throttle: 1, steer: 1 });
    physics.stepTicks(180);

    const state = physics.getCarState("car-a");
    const expectedYawRate = maxCurvature(Math.abs(state.forwardSpeed)) * Math.abs(state.forwardSpeed);
    const measuredYawRate = Math.abs(yawRate());

    expect(measuredYawRate).toBeGreaterThan(expectedYawRate * 0.7);
    expect(measuredYawRate).toBeLessThan(expectedYawRate * 1.3);
  });

  it("powerslide produces meaningfully more lateral slide than normal grip", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    physics.setCarInput("car-a", { throttle: 1, steer: 1, powerslide: true });
    physics.stepTicks(30);
    const powerslideSlide = Math.abs(lateralSpeed());

    expect(powerslideSlide).toBeGreaterThan(2);
  });

  it("straight-line driving is stable: no meaningful lateral drift or heading wander", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(200); // well short of the wall (halfLength 30m)

    const state = physics.getCarState("car-a");
    expect(Math.abs(lateralSpeed())).toBeLessThan(0.3);

    const forward = V.applyQuaternion({ x: 0, y: 0, z: -1 }, state.rotation);
    const headingDeviationRadians = Math.acos(V.clamp(V.dot(forward, { x: 0, y: 0, z: -1 }), -1, 1));
    expect((headingDeviationRadians * 180) / Math.PI).toBeLessThan(3);
  });

  it("no-boost top speed is unaffected by the grip/steering tuning change", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(280); // reaches steady-state speed before the wall
    const state = physics.getCarState("car-a");
    expect(state.forwardSpeed).toBeGreaterThan(RL_CONSTANTS.noBoostDriveSpeed - 1.5);
    expect(state.forwardSpeed).toBeLessThanOrEqual(RL_CONSTANTS.noBoostDriveSpeed + 0.5);
  });
});
