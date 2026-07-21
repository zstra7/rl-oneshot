import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { driveTowardPoint } from "@/ai/GroundManeuverController";
import * as V from "@/physics/Vec3Math";

/**
 * Pins the ground-steering sign convention: steer:+1 must turn the car
 * clockwise viewed from above (a "right" turn), matching the human input
 * mapping (D key => steerRight - steerLeft => +1 => turns right). See
 * plan/POLISH_OVERHAUL_PLAN.md WS1.A.
 */
describe("Ground steering sign convention", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 1, z: 0 } });
    physics.stepTicks(90);
  });

  afterEach(() => {
    physics.dispose();
  });

  function carForward(): V.Vec3Like {
    const state = physics.getCarState("car-a");
    return V.applyQuaternion({ x: 0, y: 0, z: -1 }, state.rotation);
  }

  it("steer=+1 turns the car clockwise (rightward) viewed from above", () => {
    const initialForward = carForward();

    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    physics.setCarInput("car-a", { throttle: 1, steer: 1 });
    physics.stepTicks(120);

    const finalForward = carForward();
    const turnCross = V.cross(initialForward, finalForward);

    // A clockwise turn viewed from above (right turn) has a negative Y
    // component in this right-handed, Y-up coordinate system.
    expect(turnCross.y).toBeLessThan(0);
  });

  it("steer=-1 turns the car counter-clockwise (leftward) viewed from above", () => {
    const initialForward = carForward();

    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    physics.setCarInput("car-a", { throttle: 1, steer: -1 });
    physics.stepTicks(120);

    const finalForward = carForward();
    const turnCross = V.cross(initialForward, finalForward);

    expect(turnCross.y).toBeGreaterThan(0);
  });
});

describe("AI ground maneuver steering direction (post steer-sign fix)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 1, z: 0 } });
    physics.stepTicks(90);
  });

  afterEach(() => {
    physics.dispose();
  });

  /**
   * driveTowardPoint is a full-throttle, no-braking pursuit controller
   * designed for chasing a moving ball, not for converging onto a static
   * point (it overshoots and loops around a static target, which makes
   * multi-tick distance/heading convergence an unreliable metric for a
   * sign-correctness test). What WS1.A actually needs to verify is that
   * the AI's single-call steer *output sign* matches the direction of the
   * target relative to the car — a direct, deterministic check with none
   * of that dynamics noise.
   */
  it("outputs positive steer for a target ahead-and-to-the-right", () => {
    const state = physics.getCarState("car-a");
    const input = driveTowardPoint(state, { x: 10, y: 1, z: -5 }, { boostAllowed: false });
    expect(input.steer).toBeGreaterThan(0.3);
  });

  it("outputs negative steer for a target ahead-and-to-the-left", () => {
    const state = physics.getCarState("car-a");
    const input = driveTowardPoint(state, { x: -10, y: 1, z: -5 }, { boostAllowed: false });
    expect(input.steer).toBeLessThan(-0.3);
  });

  it("outputs steer scaling toward full lock as the target moves further off-axis", () => {
    const state = physics.getCarState("car-a");
    const slightlyRight = driveTowardPoint(state, { x: 2, y: 1, z: -10 }, { boostAllowed: false });
    const hardRight = driveTowardPoint(state, { x: 10, y: 1, z: -2 }, { boostAllowed: false });
    expect(hardRight.steer).toBeGreaterThan(slightlyRight.steer);
    expect(slightlyRight.steer).toBeGreaterThan(0);
  });
});
