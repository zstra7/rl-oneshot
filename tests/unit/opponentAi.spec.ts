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
 * 8. Basic defence, 9. Kickoff, 10. Boost-pad collection." Each test
 * below exercises one of these with the real Rapier world, following
 * the project's established "physics drives real behaviour, assert on
 * outcomes" testing pattern rather than mocking physics.
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

  it("basic defence: shadows the ball on the goal side when it threatens the AI's own goal", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 0 } });
    physics.spawnCar({ id: "car-player", transform: { x: 5, y: 1, z: 26 } });
    // Ball moving fast toward the opponent's own goal (+Z).
    physics.setBallState({ position: { x: 0, y: 1, z: 10 }, linearVelocity: { x: 0, y: 0, z: 15 } });

    const ai = new OpponentAiController();
    let sawDefend = false;

    for (let i = 0; i < 60; i += 1) {
      const input = ai.update(buildContext(physics, i));
      if (ai.getDebugState().mode === "defend") {
        sawDefend = true;
      }
      physics.setCarInput("car-opponent", input);
      physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT });
      physics.stepTicks(1);
    }

    expect(sawDefend).toBe(true);
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

  it("boost-pad collection: a low-boost AI routes to a nearby pad when the ball is distant and not urgent", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    const pad = physics.getBoostPadStates()[0]!;
    physics.spawnCar({
      id: "car-opponent",
      transform: { x: pad.position.x + 8, y: 1, z: pad.position.z },
      initialBoost: 10
    });
    // Ball far from both cars, so neither the intercept nor the defence
    // priority pre-empts the boost-collection decision.
    physics.spawnCar({ id: "car-player", transform: { x: 60, y: 1, z: 60 } });
    physics.setBallState({ position: { x: 55, y: 1, z: 55 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    const ai = new OpponentAiController();
    let sawCollect = false;

    for (let i = 0; i < 90; i += 1) {
      const input = ai.update(buildContext(physics, i));
      if (ai.getDebugState().mode === "collect-boost") {
        sawCollect = true;
      }
      physics.setCarInput("car-opponent", input);
      physics.stepTicks(1);
    }

    expect(sawCollect).toBe(true);
  });

  it("retreat: holds a goal-side position when neither attacking nor defending nor low on boost", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 0 }, initialBoost: 80 });
    physics.spawnCar({ id: "car-player", transform: { x: 60, y: 1, z: 60 } });
    physics.setBallState({ position: { x: 55, y: 1, z: 55 }, linearVelocity: { x: 0, y: 0, z: 0 } });
    physics.stepTicks(90); // let the car settle onto the ground first

    const ai = new OpponentAiController();
    const input = ai.update(buildContext(physics, 90));

    expect(ai.getDebugState().mode).toBe("retreat");
    expect(Number.isFinite(input.steer)).toBe(true);
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
