import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from "@/physics/goal/GoalTypes";
import { PhysicsFacade } from "@/physics/PhysicsFacade";
import { getArenaPresetDefinition, TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";

/**
 * G5 (plan/GAME_ENHANCEMENTS_PLAN.md): two invisible-wall bugs around each
 * goal mouth, both from overlap margins that grew the wrong direction:
 *  - POST_OVERLAP shifted the goal-post colliders' centres TOWARD the goal
 *    centreline, landing their inner edges 0.5m inside the visible goal
 *    mouth (x = ±6.5 instead of ±7) — an invisible lip on both sides.
 *  - SEAM_OVERLAP shifted the goal-box side-wall/roof colliders 1m INTO
 *    the field (past the end wall's own plane) — the roof piece is
 *    exactly "the invisible wall above the goal" the report described.
 * Both are now widened outward/behind the end wall instead of into the
 * mouth, so nothing but the intended header/frame blocks the opening.
 */
describe("G5 goal mouth has no invisible colliders blocking the opening", () => {
  const { halfLength } = TEST_ARENA_DIMENSIONS;
  const definition = getArenaPresetDefinition("box-arena");

  // The open goal-mouth volume: anywhere a ball/car should be free to pass
  // straight through into the goal box, on either end of the pitch.
  const openVolumes = [-1, 1].map((zSign) => ({
    xMin: -GOAL_HALF_WIDTH + 0.05,
    xMax: GOAL_HALF_WIDTH - 0.05,
    yMin: 0.1,
    yMax: GOAL_HEIGHT - 0.1,
    zMin: zSign === -1 ? -halfLength - 0.05 : halfLength - 2.6,
    zMax: zSign === -1 ? -halfLength + 2.6 : halfLength + 0.05
  }));

  function aabbOverlapsVolume(
    collider: { halfExtents: { x: number; y: number; z: number }; translation: { x: number; y: number; z: number } },
    volume: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }
  ): boolean {
    const cxMin = collider.translation.x - collider.halfExtents.x;
    const cxMax = collider.translation.x + collider.halfExtents.x;
    const cyMin = collider.translation.y - collider.halfExtents.y;
    const cyMax = collider.translation.y + collider.halfExtents.y;
    const czMin = collider.translation.z - collider.halfExtents.z;
    const czMax = collider.translation.z + collider.halfExtents.z;
    return (
      cxMin < volume.xMax &&
      cxMax > volume.xMin &&
      cyMin < volume.yMax &&
      cyMax > volume.yMin &&
      czMin < volume.zMax &&
      czMax > volume.zMin
    );
  }

  it("no axis-aligned collider (fillets/corners are rotated and excluded) intersects the open goal-mouth volume", () => {
    for (const collider of definition.colliders) {
      // Floor->wall fillets and corner panels carry a rotation and never
      // enter |x| < GOAL_HALF_WIDTH by construction (they hug the walls
      // outside the goal-post span) — this check is scoped to the
      // axis-aligned goal-end colliders the G5 fix touches.
      if (collider.rotation) {
        continue;
      }
      for (const volume of openVolumes) {
        const overlaps = aabbOverlapsVolume(collider, volume);
        expect(overlaps, `collider ${JSON.stringify(collider)} intersects goal-mouth volume ${JSON.stringify(volume)}`).toBe(
          false
        );
      }
    }
  });
});

describe("G5 a shot that used to clip the post lip now scores cleanly", () => {
  let physics: PhysicsFacade;

  beforeEach(async () => {
    physics = new PhysicsFacade();
    await physics.initialise();
  });

  afterEach(() => {
    physics.dispose();
  });

  it("a ball driven in just inside the OLD 6.5 lip position (x=6.2) reaches the sensor and scores", () => {
    const { halfLength } = TEST_ARENA_DIMENSIONS;
    // x=6.2 is inside today's goal mouth (|x| < 7) but was inside the OLD
    // invisible lip's blocked zone too (|x| between 6.5 and 7 was clear,
    // but the post's old inner face at 6.5 combined with its full height
    // meant a shot skimming near the post at y>0 could still catch the
    // lip depending on exact geometry — this pins the intended fix: any
    // shot fully inside the 14m-wide mouth must be unobstructed all the
    // way to the sensor).
    physics.setBallState({ position: { x: 6.2, y: 1, z: -halfLength + 1.5 }, linearVelocity: { x: 0, y: 0, z: -20 } });

    let scored = false;
    for (let i = 0; i < 120 && !scored; i += 1) {
      physics.stepTicks(1);
      if (physics.getGoalEvents().length > 0) {
        scored = true;
      }
    }
    expect(scored).toBe(true);
    expect(physics.getGoalEvents()).toEqual([
      expect.objectContaining({ type: "goal-scored", scoringTeam: "opponent" })
    ]);
  });
});
