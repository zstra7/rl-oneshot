import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/**
 * G6 (plan/GAME_ENHANCEMENTS_PLAN.md): real Rocket League barely moves the
 * car on ball contact; ours used the same 180:30 mass ratio but Rapier
 * resolves that contact more symmetrically than Bullet, so the ball
 * visibly shoved the car around a bit too much on a hit. `carBall.
 * ballPushbackScale` (default 0.55) blends the car's post-step velocity
 * back toward its pre-step value on any tick it's touching the ball —
 * damping the CAR's kick without touching the ball's own bounce.
 */
describe("G6 ball-car pushback damping", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  function settleGroundedCarAt(z: number): void {
    physics.spawnCar({ id: "car-a", transform: { x: 0, y: 0.4, z } });
    physics.stepTicks(30); // let it settle onto the floor
  }

  function fireBallAt(z: number, speed: number): void {
    physics.setBallState({ position: { x: 0, y: 1, z }, linearVelocity: { x: 0, y: 0, z: speed } });
  }

  it("the damped default kicks the car noticeably less than an undamped (scale=1.0) hit", async () => {
    // Default parameters (ballPushbackScale: 0.55).
    settleGroundedCarAt(0);
    fireBallAt(-10, 30);
    for (let i = 0; i < 10; i += 1) physics.stepTicks(1);
    const dampedCarSpeed = V.length(physics.getCarState("car-a").linearVelocity);
    const dampedBallSpeed = V.length(physics.getBallState().linearVelocity);
    physics.dispose();

    // Undamped (scale=1.0 -> Rapier's raw contact-solve result kept in full).
    physics = new PhysicsFacade();
    await physics.initialise();
    physics.setPhysicsParameters({ carBall: { ballPushbackScale: 1.0 } });
    settleGroundedCarAt(0);
    fireBallAt(-10, 30);
    for (let i = 0; i < 10; i += 1) physics.stepTicks(1);
    const undampedCarSpeed = V.length(physics.getCarState("car-a").linearVelocity);
    const undampedBallSpeed = V.length(physics.getBallState().linearVelocity);

    expect(dampedCarSpeed).toBeLessThan(undampedCarSpeed * 0.6);

    // The ball's own bounce is essentially unaffected — only the car's
    // kick is damped. Allow some tolerance: the extra-hit contribution
    // reads the ball's velocity and car's (damped) velocity, so a large
    // car-speed change can cause a small second-order difference in the
    // ball's onset-tick contribution.
    const ballSpeedRatio = dampedBallSpeed / undampedBallSpeed;
    expect(ballSpeedRatio).toBeGreaterThan(0.9);
    expect(ballSpeedRatio).toBeLessThan(1.1);
  });

  it("a car untouched by the ball is completely unaffected by ballPushbackScale", () => {
    settleGroundedCarAt(20); // far from the ball's path below
    fireBallAt(-10, 30);
    const before = physics.getCarState("car-a").linearVelocity;
    for (let i = 0; i < 20; i += 1) physics.stepTicks(1);
    const after = physics.getCarState("car-a").linearVelocity;
    expect(V.length(V.sub(after, before))).toBeLessThan(0.05);
  });
});
