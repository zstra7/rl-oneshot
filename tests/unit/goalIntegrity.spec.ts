import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RL_CONSTANTS } from "@/physics/PhysicsConstants";
import { GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT } from "@/physics/goal/GoalTypes";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";

/**
 * WS5.B (plan/POLISH_OVERHAUL_PLAN.md): the goal-box seam fix (overlapping
 * side-wall/roof colliders, widened post segments) plus dimension
 * unification (visual goal opening now matches the physics 14m opening).
 */
describe("Goal integrity: no phase-through, still scores, kickoff ball on ground", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  const { halfWidth, halfLength } = TEST_ARENA_DIMENSIONS;
  const maxX = halfWidth + 1.2;
  const maxY = GOAL_HEIGHT + 1.2;
  const maxZ = halfLength + GOAL_DEPTH + 1.2;

  const attackVectors: ReadonlyArray<{ position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number } }> = [
    { position: { x: GOAL_HALF_WIDTH - 0.2, y: 0.5, z: -halfLength }, velocity: { x: 5, y: 0, z: -40 } },
    { position: { x: -(GOAL_HALF_WIDTH - 0.2), y: 0.5, z: -halfLength }, velocity: { x: -5, y: 0, z: -40 } },
    { position: { x: GOAL_HALF_WIDTH - 0.2, y: GOAL_HEIGHT - 0.2, z: -halfLength }, velocity: { x: 5, y: 5, z: -40 } },
    { position: { x: -(GOAL_HALF_WIDTH - 0.2), y: GOAL_HEIGHT - 0.2, z: -halfLength }, velocity: { x: -5, y: 5, z: -40 } },
    { position: { x: GOAL_HALF_WIDTH - 0.2, y: 0.5, z: halfLength }, velocity: { x: 5, y: 0, z: 40 } },
    { position: { x: -(GOAL_HALF_WIDTH - 0.2), y: 0.5, z: halfLength }, velocity: { x: -5, y: 0, z: 40 } },
    { position: { x: GOAL_HALF_WIDTH - 0.2, y: GOAL_HEIGHT - 0.2, z: halfLength }, velocity: { x: 5, y: 5, z: 40 } },
    { position: { x: -(GOAL_HALF_WIDTH - 0.2), y: GOAL_HEIGHT - 0.2, z: halfLength }, velocity: { x: -5, y: 5, z: 40 } }
  ];

  it.each(attackVectors.map((v, i) => ({ ...v, index: i })))(
    "ball fired at goal-mouth corner/seam #%#s never phases through the arena bounds",
    ({ position, velocity }) => {
      physics.setBallState({ position, linearVelocity: velocity });

      for (let i = 0; i < 600; i += 1) {
        physics.stepTicks(1);
        const ball = physics.getBallState();
        expect(Math.abs(ball.position.x)).toBeLessThanOrEqual(maxX);
        expect(ball.position.y).toBeGreaterThanOrEqual(-1);
        expect(ball.position.y).toBeLessThanOrEqual(maxY);
        expect(Math.abs(ball.position.z)).toBeLessThanOrEqual(maxZ);
      }
    }
  );

  it("a ball fired straight down the middle still scores for the correct team, both ends", () => {
    physics.setBallState({ position: { x: 0, y: 1, z: -25 }, linearVelocity: { x: 0, y: 0, z: -15 } });
    for (let i = 0; i < 240 && physics.getGoalEvents().length === 0; i += 1) {
      physics.stepTicks(1);
    }
    expect(physics.getGoalEvents()).toEqual([
      expect.objectContaining({ type: "goal-scored", scoringTeam: "opponent" })
    ]);

    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
    physics.setBallState({ position: { x: 0, y: 1, z: 25 }, linearVelocity: { x: 0, y: 0, z: 15 } });
    for (let i = 0; i < 240 && physics.getGoalEvents().length === 0; i += 1) {
      physics.stepTicks(1);
    }
    expect(physics.getGoalEvents()).toEqual([
      expect.objectContaining({ type: "goal-scored", scoringTeam: "player" })
    ]);
  });

  it("the ball rests on the floor at kickoff (no 8m drop), settling almost immediately", () => {
    physics.resetWorld({ carCreationOrder: ["car-player", "car-opponent"] });
    const ball = physics.getBallState();
    expect(ball.position.y).toBeCloseTo(RL_CONSTANTS.ballRadius, 1);

    physics.stepTicks(30);
    const settled = physics.getBallState();
    expect(settled.position.y).toBeCloseTo(RL_CONSTANTS.ballRadius, 1);
    expect(
      Math.hypot(settled.linearVelocity.x, settled.linearVelocity.y, settled.linearVelocity.z)
    ).toBeLessThan(0.5);
  });
});
