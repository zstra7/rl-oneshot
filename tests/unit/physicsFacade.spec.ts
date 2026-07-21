import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

describe("PhysicsFacade (Phase 3 foundation)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  it("spawns two cars and a ball with no NaN state", () => {
    physics.spawnCar({ id: "car-player", transform: { x: -6, y: 1, z: -10 } });
    physics.spawnCar({ id: "car-opponent", transform: { x: 6, y: 1, z: 10 } });

    expect(physics.getCarIds()).toEqual(["car-player", "car-opponent"]);

    const world = physics.getWorldState();
    expect(world.cars).toHaveLength(2);
    assertFinite(world.ball.position);
    for (const car of world.cars) {
      assertFinite(car.position);
    }
  });

  it("rejects duplicate CarIds", () => {
    physics.spawnCar({ id: "car-player", transform: { x: 0, y: 1, z: 0 } });
    expect(() =>
      physics.spawnCar({ id: "car-player", transform: { x: 1, y: 1, z: 1 } })
    ).toThrow();
  });

  it("the ball falls under gravity", () => {
    physics.setBallState({
      position: { x: 0, y: 20, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });

    const before = physics.getBallState().position.y;
    physics.stepTicks(30);
    const after = physics.getBallState().position.y;

    expect(after).toBeLessThan(before);
  });

  it("the ball bounces off the floor instead of tunnelling through it", () => {
    physics.setBallState({
      position: { x: 0, y: 5, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });

    let minY = Infinity;
    let sawUpwardVelocityAfterContact = false;

    for (let i = 0; i < 600; i += 1) {
      physics.stepTicks(1);
      const state = physics.getBallState();
      minY = Math.min(minY, state.position.y);

      if (state.position.y <= RL_CONSTANTS.ballRadius + 0.05 && state.linearVelocity.y > 0.1) {
        sawUpwardVelocityAfterContact = true;
      }
    }

    // Never tunnels below the floor (floor top is at y=0).
    expect(minY).toBeGreaterThan(-0.05);
    expect(sawUpwardVelocityAfterContact).toBe(true);
  });

  it("never produces NaN over a long run", () => {
    physics.spawnCar({ id: "car-player", transform: { x: -6, y: 1, z: -10 } });
    physics.spawnCar({ id: "car-opponent", transform: { x: 6, y: 1, z: 10 } });
    physics.setBallState({ position: { x: 0, y: 10, z: 0 } });

    physics.stepTicks(1200);

    const world = physics.getWorldState();
    assertFinite(world.ball.position);
    assertFinite(world.ball.linearVelocity);
    for (const car of world.cars) {
      assertFinite(car.position);
      assertFinite(car.linearVelocity);
    }
  });

  it("clamps ball speed to RL_CONSTANTS.ballMaxSpeed", () => {
    physics.setBallState({
      position: { x: 0, y: 10, z: 0 },
      linearVelocity: { x: 500, y: 0, z: 0 }
    });

    physics.stepTicks(1);

    const speed = physics.getBallState().speed;
    expect(speed).toBeLessThanOrEqual(RL_CONSTANTS.ballMaxSpeed + 1e-6);
  });

  it("clamps car speed to RL_CONSTANTS.carMaxSpeed", () => {
    physics.spawnCar({ id: "car-player", transform: { x: 0, y: 1, z: 0 } });
    physics.setCarState("car-player", {
      linearVelocity: { x: 500, y: 0, z: 0 }
    });

    physics.stepTicks(1);

    const speed = physics.getCarState("car-player").speed;
    expect(speed).toBeLessThanOrEqual(RL_CONSTANTS.carMaxSpeed + 1e-6);
  });

  it("two cars collide with each other and separate rather than overlapping forever", () => {
    physics.spawnCar({ id: "car-a", transform: { x: -1, y: 1, z: 0 } });
    physics.spawnCar({ id: "car-b", transform: { x: 1, y: 1, z: 0 } });

    physics.setCarState("car-a", { linearVelocity: { x: 5, y: 0, z: 0 } });
    physics.setCarState("car-b", { linearVelocity: { x: -5, y: 0, z: 0 } });

    physics.stepTicks(120);

    const [carA, carB] = physics.getAllCarStates();
    assertFinite(carA!.position);
    assertFinite(carB!.position);
    // They must not have passed through each other (car-a stays left of car-b).
    expect(carA!.position.x).toBeLessThan(carB!.position.x);
  });

  it("both cars can contact the ball in the same run without NaN or lost entities", () => {
    physics.spawnCar({ id: "car-player", transform: { x: -3, y: 1, z: -2 } });
    physics.spawnCar({ id: "car-opponent", transform: { x: 3, y: 1, z: 2 } });
    physics.setBallState({ position: { x: 0, y: 2, z: 0 } });

    physics.setCarState("car-player", { linearVelocity: { x: 4, y: 0, z: 3 } });
    physics.setCarState("car-opponent", { linearVelocity: { x: -4, y: 0, z: -3 } });

    physics.stepTicks(240);

    expect(physics.getCarIds()).toHaveLength(2);
    const world = physics.getWorldState();
    assertFinite(world.ball.position);
    for (const car of world.cars) {
      assertFinite(car.position);
    }
  });

  it("resetWorld() is repeatable: same setup replayed twice yields the same trajectory", () => {
    function runAndCapture(): number[] {
      physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
      physics.setBallState({ position: { x: 0, y: 6, z: 0 }, linearVelocity: { x: 1, y: 0, z: 0.5 } });

      const heights: number[] = [];
      for (let i = 0; i < 60; i += 1) {
        physics.stepTicks(1);
        heights.push(physics.getBallState().position.y);
      }
      return heights;
    }

    const first = runAndCapture();
    const second = runAndCapture();

    expect(first).toEqual(second);
  });

  it("resetWorld() car creation order can be varied for order-independence tests", () => {
    physics.resetWorld({ carCreationOrder: ["car-opponent", "car-player"] });
    expect(physics.getCarIds()).toEqual(["car-opponent", "car-player"]);
  });

  it("manual stepTicks() advances the tick counter deterministically", () => {
    const before = physics.getTick();
    physics.stepTicks(120);
    expect(physics.getTick()).toBe(before + 120);
  });

  it("getRenderSnapshot() interpolates between the previous and current tick", () => {
    physics.spawnCar({ id: "car-player", transform: { x: 0, y: 1, z: 0 } });
    physics.setCarState("car-player", { linearVelocity: { x: 10, y: 0, z: 0 } });

    physics.stepTicks(1);
    const before = physics.getRenderSnapshot(0).cars.get("car-player")!.position.x;
    const after = physics.getRenderSnapshot(1).cars.get("car-player")!.position.x;
    const midpoint = physics.getRenderSnapshot(0.5).cars.get("car-player")!.position.x;

    expect(midpoint).toBeGreaterThan(Math.min(before, after) - 1e-6);
    expect(midpoint).toBeLessThan(Math.max(before, after) + 1e-6);
  });
});

function assertFinite(vec: { x: number; y: number; z: number }): void {
  expect(Number.isFinite(vec.x)).toBe(true);
  expect(Number.isFinite(vec.y)).toBe(true);
  expect(Number.isFinite(vec.z)).toBe(true);
}
