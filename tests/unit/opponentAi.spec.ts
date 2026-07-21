import { describe, expect, it } from "vitest";

import { OpponentAiController } from "@/ai/OpponentAiController";
import type { AiUpdateContext } from "@/ai/AiTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import { NEUTRAL_CAR_INPUT } from "@/physics/PhysicsTypes";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

/** Builds an AiUpdateContext from live physics state each tick. */
function buildContext(
  physics: PhysicsFacade,
  tick: number,
  matchState: MatchState = "MATCH_ENDING"
): AiUpdateContext {
  return {
    tick,
    matchState,
    controlledCar: physics.getCarState("car-opponent"),
    humanCar: physics.getCarState("car-player"),
    ball: physics.getBallState(),
    boostPads: physics.getBoostPadStates(),
    ownGoalCentre: physics.getGoalSensorCentre("opponent")!,
    targetGoalCentre: physics.getGoalSensorCentre("player")!
  };
}

/**
 * Core architecture spec section 65 lists Phase 9's exit list as:
 * "1. Ground target driving, 2. Recovery, 3. Ball prediction,
 * 4. Reachability, 5. Basic intercept, 6. Shoot open goal, 7. Retreat,
 * 8. Basic defence, 9. Kickoff, 10. Boost-pad collection." WS6
 * (plan/POLISH_OVERHAUL_PLAN.md) replaced the utility-scored planner
 * (ball-trajectory prediction, reachability-based defend/clear/retreat/
 * collect-boost mode selection) with a minimal chase-and-shoot planner
 * plus real stuck recovery — the AI no longer has distinct defence,
 * retreat, or boost-collection modes, so items 3/4/7/10 above no longer
 * have a dedicated test; item 8 ("basic defence") is now covered by a
 * weaker but still meaningful "doesn't idle when the ball threatens its
 * own goal" check, since the single chase-and-shoot mode always goes
 * for the ball regardless of which end of the field it's on. See
 * docs/ai-calibration-log.md for the removal rationale. Each remaining
 * test exercises real Rapier physics, following the project's
 * established "physics drives real behaviour, assert on outcomes"
 * testing pattern rather than mocking physics.
 */
describe("OpponentAiController (Phase 9 basic opponent AI)", () => {
  it("recovery: rights an upside-down car via pitch/roll before resuming normal play", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 5, z: 0 } });
    physics.spawnCar({ id: "car-player", transform: { x: 10, y: 1, z: 10 } });
    // A near-exact 180-degree flip is the hardest case: the naive
    // proportional error term is degenerate here (see
    // docs/physics-deviations.md Phase 9 section).
    physics.setCarState("car-opponent", {
      rotation: { x: 0, y: 0, z: 1, w: 0 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });

    const ai = new OpponentAiController();

    for (let i = 0; i < 300; i += 1) {
      const input = ai.update(buildContext(physics, i));
      physics.setCarInput("car-opponent", input);
      physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT });
      physics.stepTicks(1);
    }

    const finalState = physics.getCarState("car-opponent");
    const up = V.applyQuaternion(V.UP, finalState.rotation);
    expect(up.y).toBeGreaterThan(0.7);
    expect(finalState.grounded).toBe(true);
  });

  it("ground driving + basic intercept: reaches a stationary ball via predicted trajectory sampling", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 15 } });
    physics.spawnCar({ id: "car-player", transform: { x: 20, y: 1, z: 20 } });
    physics.setBallState({ position: { x: 0, y: 1, z: 5 }, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(30);

    const ai = new OpponentAiController();
    let reachedBall = false;

    for (let i = 0; i < 600 && !reachedBall; i += 1) {
      const input = ai.update(buildContext(physics, i));
      physics.setCarInput("car-opponent", input);
      physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT });
      physics.stepTicks(1);

      const car = physics.getCarState("car-opponent");
      const ball = physics.getBallState();
      const distance = Math.hypot(car.position.x - ball.position.x, car.position.z - ball.position.z);
      reachedBall =
        distance < 2.5 || Math.abs(ball.linearVelocity.z) > 0.5 || Math.abs(ball.linearVelocity.x) > 0.5;
    }

    expect(reachedBall).toBe(true);
  });

  it("shoot open goal: the approach sends the ball toward the target goal, not sideways", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 15 } });
    physics.spawnCar({ id: "car-player", transform: { x: 20, y: 1, z: 20 } });
    physics.setBallState({ position: { x: 0, y: 1, z: 5 }, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(30);

    const ai = new OpponentAiController();
    let ballMoved = false;

    for (let i = 0; i < 600 && !ballMoved; i += 1) {
      const input = ai.update(buildContext(physics, i));
      physics.setCarInput("car-opponent", input);
      physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT });
      physics.stepTicks(1);

      const ball = physics.getBallState();
      ballMoved = Math.abs(ball.linearVelocity.z) > 1 || Math.abs(ball.linearVelocity.x) > 1;
    }

    expect(ballMoved).toBe(true);
    // The target (player) goal sits at -Z; approaching from the far side
    // of the ball should send it roughly goalward, not knock it sideways.
    expect(physics.getBallState().linearVelocity.z).toBeLessThan(-0.5);
  });

  it("doesn't idle when the ball threatens its own goal: still chases and reaches it", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 0 } });
    physics.spawnCar({ id: "car-player", transform: { x: 5, y: 1, z: 26 } });
    // WS5: the ball defaults to resting at the arena centre, overlapping
    // a car spawned at the origin — park it away before letting the car
    // settle, then move it into the test's real starting position.
    physics.setBallState({ position: { x: 50, y: 5, z: 50 } });
    physics.stepTicks(90); // let the car settle onto the ground first
    // Ball moving toward the opponent's own goal (+Z), slow enough for
    // the (prediction-free, WS6) chase-and-shoot planner to catch —
    // there's no leading/interception logic any more, only "go toward
    // the ball's current position".
    physics.setBallState({ position: { x: 0, y: 1, z: 10 }, linearVelocity: { x: 0, y: 0, z: 5 } });
    physics.stepTicks(1);

    const ai = new OpponentAiController();
    let reachedBall = false;

    for (let i = 0; i < 600 && !reachedBall; i += 1) {
      const input = ai.update(buildContext(physics, i));
      expect(ai.getDebugState().mode).toBe("attack");
      physics.setCarInput("car-opponent", input);
      physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT });
      physics.stepTicks(1);

      const distance = Math.hypot(
        physics.getCarState("car-opponent").position.x - physics.getBallState().position.x,
        physics.getCarState("car-opponent").position.z - physics.getBallState().position.z
      );
      reachedBall = distance < 2.5;
    }

    expect(reachedBall).toBe(true);
  });

  it("kickoff: commits to driving straight at the ball once PLAYING begins, even while it's still settling", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
    physics.stepTicks(220); // ball falls from y=8 and is still settling, not fully at rest

    const ai = new OpponentAiController();
    const before = physics.getCarState("car-opponent");

    for (let i = 0; i < 60; i += 1) {
      const input = ai.update(buildContext(physics, i, "PLAYING"));
      expect(ai.getDebugState().mode).toBe("kickoff");
      physics.setCarInput("car-opponent", input);
      physics.stepTicks(1);
    }

    const after = physics.getCarState("car-opponent");
    const distanceFromCentreBefore = Math.hypot(before.position.x, before.position.z);
    const distanceFromCentreAfter = Math.hypot(after.position.x, after.position.z);
    expect(distanceFromCentreAfter).toBeLessThan(distanceFromCentreBefore);
  });

  it("produces finite CarInput values across a long mixed-scenario run (no NaN)", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });

    const ai = new OpponentAiController();

    for (let i = 0; i < 900; i += 1) {
      const state = i < 450 ? "COUNTDOWN_GO" : "PLAYING";
      const input = ai.update(buildContext(physics, i, state as MatchState));

      for (const value of Object.values(input)) {
        if (typeof value === "number") {
          expect(Number.isFinite(value)).toBe(true);
        }
      }

      physics.setCarInput("car-opponent", input);
      physics.stepTicks(1);
    }

    const finalCar = physics.getCarState("car-opponent");
    expect(Number.isFinite(finalCar.position.x)).toBe(true);
    expect(Number.isFinite(finalCar.position.y)).toBe(true);
    expect(Number.isFinite(finalCar.position.z)).toBe(true);
  });
});
