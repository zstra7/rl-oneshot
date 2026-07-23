import { describe, expect, it } from "vitest";

import type { AiDifficulty } from "@/ai/AiDifficulty";
import { OpponentAiController } from "@/ai/OpponentAiController";
import type { AiUpdateContext } from "@/ai/AiTypes";
import type { MatchState } from "@/game-flow/MatchFlowTypes";
import { NEUTRAL_CAR_INPUT } from "@/physics/PhysicsTypes";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import * as V from "@/physics/Vec3Math";

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
 * Measures ticks from a sudden, unpredictable ball relocation until the
 * AI's chosen approach target measurably shifts in response — a direct
 * measurement of AI spec section 6.2's reaction-delay mechanism
 * (perception delay + tactical replanning cadence), independent of
 * emergent chase/steering dynamics.
 */
async function measureReactionLagTicks(difficulty: AiDifficulty, seed: number): Promise<number> {
  const physics = new PhysicsFacade();
  await physics.initialise();
  physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 0 }, initialBoost: 80 });
  physics.spawnCar({ id: "car-player", transform: { x: 40, y: 1, z: 40 } });
  physics.setBallState({ position: { x: 25, y: 1, z: 25 }, linearVelocity: { x: 0, y: 0, z: 0 } });
  physics.stepTicks(30);

  const ai = new OpponentAiController();
  ai.setDifficulty(difficulty);
  ai.setSeed(seed);

  let lastTarget = { x: 0, z: 0 };
  for (let i = 0; i < 120; i += 1) {
    const input = ai.update(buildContext(physics, i));
    physics.setCarInput("car-opponent", input);
    physics.stepTicks(1);
    const target = ai.getDebugState().targetPosition;
    lastTarget = { x: target.x, z: target.z };
  }

  // A "surprise" event the AI cannot have anticipated.
  physics.setBallState({ position: { x: -25, y: 1, z: -25 }, linearVelocity: { x: 0, y: 0, z: 0 } });

  const changeTick = 120;
  const maxTicks = 400;
  for (let i = changeTick; i < changeTick + maxTicks; i += 1) {
    const input = ai.update(buildContext(physics, i));
    physics.setCarInput("car-opponent", input);
    physics.stepTicks(1);

    const target = ai.getDebugState().targetPosition;
    const shifted = Math.hypot(target.x - lastTarget.x, target.z - lastTarget.z) > 5;
    if (shifted) {
      physics.dispose();
      return i - changeTick;
    }
  }
  physics.dispose();
  return maxTicks;
}

/**
 * Core architecture spec section 66's Phase 10 exit criteria: "Difficulty
 * ordering holds statistically. Medium is viable default. Hard is not
 * omniscient. Easy remains functional. Full-match AI tests pass."
 */
describe("AI difficulty and tactics (Phase 10)", () => {
  it("setDifficulty/getDifficulty round-trips and medium is the default", () => {
    const ai = new OpponentAiController();
    expect(ai.getDifficulty()).toBe("medium");
    ai.setDifficulty("hard");
    expect(ai.getDifficulty()).toBe("hard");
    ai.setDifficulty("easy");
    expect(ai.getDifficulty()).toBe("easy");
    ai.setDifficulty("legend");
    expect(ai.getDifficulty()).toBe("legend");
  });

  it("difficulty ordering holds statistically: legend reacts faster than hard reacts faster than medium reacts faster than easy", async () => {
    const seeds = [1, 2, 3, 4, 5];
    const results: Record<AiDifficulty, number[]> = { easy: [], medium: [], hard: [], legend: [] };

    for (const difficulty of ["easy", "medium", "hard", "legend"] as const) {
      for (const seed of seeds) {
        results[difficulty].push(await measureReactionLagTicks(difficulty, seed));
      }
    }

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    // Legend is not omniscient: it still has a nonzero perception delay,
    // never reacts on the very same tick as the surprise event.
    expect(Math.min(...results.legend)).toBeGreaterThan(0);

    expect(avg(results.legend)).toBeLessThan(avg(results.hard));
    expect(avg(results.hard)).toBeLessThan(avg(results.medium));
    expect(avg(results.medium)).toBeLessThan(avg(results.easy));
  }, 45_000);

  it("same seed and same scenario produce the same outcome (AI spec section 8 determinism)", async () => {
    async function runOnce(): Promise<{ x: number; z: number }> {
      const physics = new PhysicsFacade();
      await physics.initialise();
      physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 15 } });
      physics.spawnCar({ id: "car-player", transform: { x: 20, y: 1, z: 20 } });
      physics.setBallState({ position: { x: 3, y: 1, z: 5 }, linearVelocity: { x: -1, y: 0, z: 0 } });
      physics.stepTicks(30);

      const ai = new OpponentAiController();
      ai.setDifficulty("easy"); // highest noise -- most sensitive to a seeding bug
      ai.setSeed(42);

      for (let i = 0; i < 200; i += 1) {
        const input = ai.update(buildContext(physics, i));
        physics.setCarInput("car-opponent", input);
        physics.stepTicks(1);
      }

      const finalState = physics.getCarState("car-opponent");
      physics.dispose();
      return { x: finalState.position.x, z: finalState.position.z };
    }

    const first = await runOnce();
    const second = await runOnce();
    expect(second.x).toBeCloseTo(first.x, 6);
    expect(second.z).toBeCloseTo(first.z, 6);
  });

  it("always plans an in-bounds attack target, near or far from its own goal", async () => {
    // WS6 (plan/POLISH_OVERHAUL_PLAN.md) replaced the reachability-scored
    // defend/clear mode split with a single chase-and-shoot planner —
    // there's no longer a distinct "clear" vs "defend" mode to
    // distinguish; this instead pins down that the planner still
    // produces a sane, arena-bounded target regardless of how close the
    // ball is to the AI's own goal.
    async function targetFor(ballZ: number, ballVelocityZ: number): Promise<{ x: number; z: number }> {
      const physics = new PhysicsFacade();
      await physics.initialise();
      physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 25 } });
      physics.spawnCar({ id: "car-player", transform: { x: 20, y: 1, z: -20 } });
      physics.stepTicks(90); // let the car settle onto the ground first

      physics.setBallState({
        position: { x: 0, y: 1, z: ballZ },
        linearVelocity: { x: 0, y: 0, z: ballVelocityZ }
      });
      physics.stepTicks(1);

      const ai = new OpponentAiController();
      ai.setDifficulty("medium");
      const input = ai.update(buildContext(physics, 91));
      physics.setCarInput("car-opponent", input);

      expect(ai.getDebugState().mode).toBe("attack");
      const target = ai.getDebugState().targetPosition;
      physics.dispose();
      return { x: target.x, z: target.z };
    }

    for (const target of [await targetFor(29, 3), await targetFor(15, 8)]) {
      expect(Number.isFinite(target.x)).toBe(true);
      expect(Number.isFinite(target.z)).toBe(true);
      expect(Math.abs(target.x)).toBeLessThanOrEqual(20);
      expect(Math.abs(target.z)).toBeLessThanOrEqual(30);
    }
  });

  it("mistakes (humanisation) never produce non-finite input or reversed controls", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });

    const ai = new OpponentAiController();
    ai.setDifficulty("easy"); // highest mistakeFrequency
    ai.setSeed(7);

    for (let i = 0; i < 900; i += 1) {
      const state = i < 450 ? "COUNTDOWN_GO" : "PLAYING";
      const input = ai.update(buildContext(physics, i, state as MatchState));

      for (const value of Object.values(input)) {
        if (typeof value === "number") {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(-1);
          expect(value).toBeLessThanOrEqual(1);
        }
      }

      physics.setCarInput("car-opponent", input);
      physics.setCarInput("car-player", { ...NEUTRAL_CAR_INPUT });
      physics.stepTicks(1);
    }

    physics.dispose();
  });

  it("limited jump: triggers a jump when a reachable ball is elevated out of ground reach", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 3 } });
    physics.spawnCar({ id: "car-player", transform: { x: 30, y: 1, z: 30 } });
    physics.stepTicks(90); // let the car settle onto the ground first
    physics.setBallState({ position: { x: 0, y: 2.5, z: 0 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    const ai = new OpponentAiController();
    ai.setDifficulty("medium");

    const input = ai.update(buildContext(physics, 90));
    expect(input.jump).toBe(true);

    physics.dispose();
  });

  it("hard-only limited aerial: pursues the ball airborne instead of only recovering", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 3 } });
    physics.spawnCar({ id: "car-player", transform: { x: 30, y: 1, z: 30 } });
    physics.stepTicks(90); // let the car settle onto the ground first
    physics.setBallState({ position: { x: 0, y: 2.5, z: 0 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    const ai = new OpponentAiController();
    ai.setDifficulty("hard");

    // Trigger the jump, then force the car airborne (simulating the jump
    // impulse having launched it) and confirm hard pursues rather than
    // immediately falling back to plain recovery.
    ai.update(buildContext(physics, 90));
    physics.setCarState("car-opponent", {
      position: { x: 0, y: 2, z: 1 },
      linearVelocity: { x: 0, y: 3, z: 0 }
    });
    physics.stepTicks(1); // still airborne this tick
    const airborneInput = ai.update(buildContext(physics, 91));

    expect(ai.getDebugState().mode).toBe("attack");
    expect(Number.isFinite(airborneInput.pitch)).toBe(true);
    expect(Number.isFinite(airborneInput.yaw)).toBe(true);

    physics.dispose();
  });

  /**
   * F5 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md) mandatory re-audit:
   * "finite input" alone (the test above) can't catch a sign error --
   * `computeAerialPursuitInput` produces finite pitch/yaw even when
   * aiming the nose away from the ball. This drives real physics
   * (`ai.update()` -> `setCarInput` -> `stepTicks`, the project's
   * established "physics drives real behaviour" pattern) for 30 ticks
   * with the ball placed above and to the side, and asserts the
   * forward/to-ball angle is smaller at the end than at the start.
   * Verified empirically (per the plan's instruction not to trust a
   * paper sign derivation) that `computeAerialPursuitInput`'s existing
   * yaw/pitch formulas need NO sign change post-F5 -- they already
   * happened to point the wrong way under the OLD physics (a second,
   * separate bug nobody noticed because aerial pursuit was gated behind
   * the same ~23x-weak control authority), and now correctly close the
   * angle under the new, correctly-signed AerialController.
   */
  it("hard-only limited aerial: the nose measurably converges toward an elevated, off-axis ball over 30 ticks", async () => {
    const physics = new PhysicsFacade();
    await physics.initialise();
    physics.spawnCar({ id: "car-opponent", transform: { x: 0, y: 1, z: 3 } });
    physics.spawnCar({ id: "car-player", transform: { x: 30, y: 1, z: 30 } });
    physics.stepTicks(90);
    physics.setBallState({ position: { x: 0, y: 2.5, z: 0 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    const ai = new OpponentAiController();
    ai.setDifficulty("hard");
    // Grounded call, close + tall enough ball to trigger maybeJump's
    // aerialPursuitTicksRemaining budget (aerialPursuitTicksRemaining can
    // only be armed from the grounded branch -- arming it requires this
    // call to happen while the car is still genuinely grounded).
    ai.update(buildContext(physics, 90));

    physics.setCarState("car-opponent", {
      position: { x: 0, y: 4, z: 6 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 }
    });
    // Let `grounded` register truthfully (false) before the loop reads
    // it -- immediately after `setCarState` teleports the body, the
    // cached grounded flag is stale until the next physics step.
    physics.stepTicks(1);
    // Ball above and to the side: a real angle to close, not already
    // dead ahead.
    physics.setBallState({ position: { x: 3, y: 9, z: 0 }, linearVelocity: { x: 0, y: 0, z: 0 } });

    function angleToBall(): number {
      const state = physics.getCarState("car-opponent");
      const forward = V.applyQuaternion(V.LOCAL_FORWARD, state.rotation);
      const ball = physics.getBallState();
      const toBall = V.normalize(V.sub(ball.position, state.position));
      return Math.acos(V.clamp(V.dot(forward, toBall), -1, 1));
    }

    const angleStart = angleToBall();

    for (let i = 0; i < 30; i += 1) {
      const input = ai.update(buildContext(physics, 91 + i));
      expect(ai.getDebugState().mode).toBe("attack");
      physics.setCarInput("car-opponent", input);
      physics.stepTicks(1);
    }

    const angleEnd = angleToBall();
    // Measured empirically: ~45.8deg -> ~39.4deg over these 30 ticks
    // (not monotonic tick-to-tick -- the pursuit controller is a plain
    // proportional aim, so it briefly overshoots before net-converging --
    // but a clear, repeatable improvement well above noise).
    expect(angleEnd).toBeLessThan(angleStart - 0.05);

    physics.dispose();
  });
});
