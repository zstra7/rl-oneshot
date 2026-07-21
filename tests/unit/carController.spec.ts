import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { PhysicsFacade } from "@/physics/PhysicsFacade";

function assertFinite(vec: { x: number; y: number; z: number }): void {
  expect(Number.isFinite(vec.x)).toBe(true);
  expect(Number.isFinite(vec.y)).toBe(true);
  expect(Number.isFinite(vec.z)).toBe(true);
}

describe("Car controller (Phase 5)", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 1, z: 0 } });
    // WS5.B: the ball now spawns resting on the floor at the arena
    // centre (kickoff-accurate) instead of falling from 8m, which would
    // otherwise instantly overlap a car spawned at the origin. Park it
    // away by default; tests that care about the ball set their own
    // position before stepping.
    physics.setBallState({ position: { x: 15, y: 5, z: 25 } });
    // Let suspension settle before every test.
    physics.stepTicks(90);
  });

  afterEach(() => {
    physics.dispose();
  });

  it("settles onto the floor grounded, with all four wheel contacts", () => {
    const state = physics.getCarState("car-a");
    expect(state.grounded).toBe(true);
    expect(state.wheelContactCount).toBe(4);
    expect(state.supportNormal.y).toBeGreaterThan(0.99);
    assertFinite(state.position);
  });

  it("drives forward under throttle and reaches close to the no-boost drive speed", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(240);

    const state = physics.getCarState("car-a");
    expect(state.forwardSpeed).toBeGreaterThan(8);
    expect(state.forwardSpeed).toBeLessThanOrEqual(RL_CONSTANTS.noBoostDriveSpeed + 0.5);
    expect(state.grounded).toBe(true);
  });

  it("reverses under negative throttle", () => {
    physics.setCarInput("car-a", { throttle: -1 });
    physics.stepTicks(120);

    const state = physics.getCarState("car-a");
    expect(state.forwardSpeed).toBeLessThan(-1);
  });

  it("brakes: releasing throttle after driving decelerates forward speed", () => {
    physics.setCarInput("car-a", { throttle: 1 });
    physics.stepTicks(120);
    const moving = physics.getCarState("car-a").forwardSpeed;
    expect(moving).toBeGreaterThan(1);

    physics.setCarInput("car-a", { throttle: 0 });
    physics.stepTicks(60);
    const coasted = physics.getCarState("car-a").forwardSpeed;

    expect(coasted).toBeLessThan(moving);
  });

  it("steers: holding steer while driving curves the car's heading", () => {
    physics.setCarInput("car-a", { throttle: 1, steer: 1 });
    physics.stepTicks(180);

    const state = physics.getCarState("car-a");
    // Some lateral (X) displacement must have accumulated from turning.
    expect(Math.abs(state.position.x)).toBeGreaterThan(0.5);
    assertFinite(state.position);
  });

  it("boost drains boostAmount and produces more speed than throttle alone", () => {
    physics.setCarInput("car-a", { throttle: 1, boost: true });
    physics.stepTicks(120);

    const boosted = physics.getCarState("car-a");
    expect(boosted.boostAmount).toBeLessThan(RL_CONSTANTS.kickoffBoostAmount);
    expect(boosted.forwardSpeed).toBeGreaterThan(RL_CONSTANTS.noBoostDriveSpeed);
  });

  it("boostAmount floors at zero once fully consumed", () => {
    physics.setCarInput("car-a", { boost: true });
    // 33 boost / 33.3 per second drains in ~1s (120 ticks); run well past that.
    physics.stepTicks(400);

    const drained = physics.getCarState("car-a").boostAmount;
    expect(drained).toBe(0);
  });

  it("first jump applies an upward impulse and leaves the ground", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);

    const justJumped = physics.getCarState("car-a");
    expect(justJumped.linearVelocity.y).toBeGreaterThan(1.5);
    expect(justJumped.firstJumpUsed).toBe(true);
    expect(justJumped.secondJumpAvailable).toBe(true);

    physics.stepTicks(10);
    const airborne = physics.getCarState("car-a");
    expect(airborne.grounded).toBe(false);
    expect(airborne.wheelContactCount).toBe(0);
  });

  it("second jump (neutral, no directional input) applies another upward impulse", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false });
    physics.stepTicks(5);

    const beforeSecond = physics.getCarState("car-a").linearVelocity.y;

    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);

    const afterSecond = physics.getCarState("car-a");
    expect(afterSecond.linearVelocity.y).toBeGreaterThan(beforeSecond + 1.0);
    expect(afterSecond.secondJumpAvailable).toBe(false);
  });

  it("dodge with directional pitch input triggers active dodge state and a forward velocity spike", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false });
    physics.stepTicks(5);

    const beforeDodge = physics.getCarState("car-a");
    expect(beforeDodge.dodgeState).toBe("none");

    // WS3 (plan/POLISH_OVERHAUL_PLAN.md): pitch:+1 (nose-down, W in the
    // air) is the front-flip/forward-dodge trigger, matching Rocket
    // League's stick-forward-flips-forward convention — the dodge
    // direction previously used the opposite sign.
    physics.setCarInput("car-a", { jump: true, pitch: 1 });
    physics.stepTicks(1);

    const dodging = physics.getCarState("car-a");
    expect(dodging.dodgeState).toBe("active");
    // Front-flip (pitch: +1) should push the car forward (-Z).
    expect(dodging.linearVelocity.z).toBeLessThan(beforeDodge.linearVelocity.z - 2);
  });

  it("dodge transitions active -> recovery -> none over time", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false });
    physics.stepTicks(5);
    physics.setCarInput("car-a", { jump: true, yaw: 1 });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false, yaw: 0 });

    expect(physics.getCarState("car-a").dodgeState).toBe("active");

    physics.stepTicks(Math.ceil(0.65 * RL_CONSTANTS.physicsHz) + 2);
    expect(physics.getCarState("car-a").dodgeState).toBe("recovery");

    physics.stepTicks(Math.ceil(0.15 * RL_CONSTANTS.physicsHz) + 2);
    expect(physics.getCarState("car-a").dodgeState).toBe("none");
  });

  it("jump/second-jump reset after landing again", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false });

    // Fall back down and settle.
    physics.stepTicks(200);

    const landed = physics.getCarState("car-a");
    expect(landed.grounded).toBe(true);
    expect(landed.firstJumpUsed).toBe(false);
    expect(landed.secondJumpAvailable).toBe(false);
  });

  it("aerial pitch/yaw/roll rotate the car while airborne, angular speed stays clamped", () => {
    physics.setCarInput("car-a", { jump: true });
    physics.stepTicks(1);
    physics.setCarInput("car-a", { jump: false, pitch: 1, yaw: 1, roll: 1 });
    physics.stepTicks(60);

    const state = physics.getCarState("car-a");
    const angularSpeed = Math.sqrt(
      state.angularVelocity.x ** 2 + state.angularVelocity.y ** 2 + state.angularVelocity.z ** 2
    );
    expect(angularSpeed).toBeLessThanOrEqual(RL_CONSTANTS.carMaxAngularSpeed + 1e-6);
    assertFinite(state.angularVelocity);
  });

  it("car speed never exceeds carMaxSpeed even under sustained throttle+boost", () => {
    physics.setCarInput("car-a", { throttle: 1, boost: true });
    physics.stepTicks(600);

    const state = physics.getCarState("car-a");
    expect(state.speed).toBeLessThanOrEqual(RL_CONSTANTS.carMaxSpeed + 1e-6);
    assertFinite(state.linearVelocity);
  });

  it("driving into the ball scores a directional hit (car-ball authored hit)", () => {
    physics.setCarState("car-a", { position: { x: 0, y: 1, z: 6 } });
    physics.setBallState({
      position: { x: 0, y: 1, z: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 }
    });

    physics.setCarInput("car-a", { throttle: 1, boost: true });

    let hit = false;
    for (let i = 0; i < 300 && !hit; i += 1) {
      physics.stepTicks(1);
      const ball = physics.getBallState();
      if (Math.abs(ball.linearVelocity.z) > 1) {
        hit = true;
      }
    }

    expect(hit).toBe(true);
    const ball = physics.getBallState();
    // The car drove in -Z, so the ball must be knocked further in -Z.
    expect(ball.linearVelocity.z).toBeLessThan(-1);
    assertFinite(ball.linearVelocity);
  });

  it("remains stable (no NaN, bounded speed) over a long run with continuous mixed input", () => {
    physics.spawnCar({ id: "car-b", transform: { x: 5, y: 1, z: 5 } });
    physics.setBallState({ position: { x: 0, y: 3, z: 0 } });

    physics.setCarInput("car-a", { throttle: 1, steer: 0.6, boost: true, powerslide: true });
    physics.setCarInput("car-b", { throttle: -1, steer: -0.6, jump: true });

    for (let i = 0; i < 20; i += 1) {
      physics.stepTicks(60);

      // Toggle jump/dodge input periodically to exercise more code paths.
      physics.setCarInput("car-a", { jump: i % 3 === 0, pitch: i % 2 === 0 ? 1 : -1 });

      const world = physics.getWorldState();
      assertFinite(world.ball.position);
      assertFinite(world.ball.linearVelocity);
      for (const car of world.cars) {
        assertFinite(car.position);
        assertFinite(car.linearVelocity);
        assertFinite(car.angularVelocity);
        expect(car.speed).toBeLessThanOrEqual(RL_CONSTANTS.carMaxSpeed + 1e-6);
      }
    }
  });
});
