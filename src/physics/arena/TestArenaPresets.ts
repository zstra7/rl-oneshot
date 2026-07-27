import type { TeamId } from "@/core/TeamTypes";
import { generateArenaRamps } from "@/physics/arena/ArenaRampGeometry";
import { GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, type GoalSensorDefinition } from "@/physics/goal/GoalTypes";
import type { ArenaPreset } from "@/physics/PhysicsTypes";

/**
 * Physics-owned test arena dimensions (physics spec section 13). These are
 * a separate, physics-authoritative placeholder from the asset pipeline's
 * `DEFAULT_STADIUM_DIMENSIONS` — the two are expected to be unified behind
 * one `PhysicsArenaDefinition` supplied by a future stadium module (see
 * docs/physics-deviations.md), not before then.
 */
export const TEST_ARENA_DIMENSIONS = {
  halfWidth: 20,
  halfLength: 30,
  height: 20
} as const;

export interface ArenaColliderSpec {
  readonly halfExtents: { x: number; y: number; z: number };
  readonly translation: { x: number; y: number; z: number };
  /** WS5.C: optional collider orientation, for the wall→floor fillet strips. */
  readonly rotation?: { x: number; y: number; z: number; w: number };
}

export interface ArenaPresetDefinition {
  readonly preset: ArenaPreset;
  readonly colliders: readonly ArenaColliderSpec[];
  readonly goalSensors: readonly GoalSensorDefinition[];
}

const FLOOR_THICKNESS = 1;
const WALL_HALF_THICKNESS = 0.5;

function floorCollider(): ArenaColliderSpec {
  return {
    halfExtents: {
      x: TEST_ARENA_DIMENSIONS.halfWidth,
      y: FLOOR_THICKNESS / 2,
      z: TEST_ARENA_DIMENSIONS.halfLength
    },
    translation: { x: 0, y: -FLOOR_THICKNESS / 2, z: 0 }
  };
}

/**
 * Builds one end of the arena: the two goal-post wall segments plus a
 * header above the goal mouth (so the end wall is solid everywhere except
 * the goal opening), and a shallow enclosed "goal box" behind the opening
 * so a scored ball is physically caught rather than flying into the void.
 * `zSign` is -1 for the player's defended end (negative Z) and +1 for the
 * opponent's (positive Z), per game-flow spec section 4.
 */
function buildGoalEnd(zSign: -1 | 1, defendingTeam: TeamId): {
  colliders: ArenaColliderSpec[];
  sensor: GoalSensorDefinition;
} {
  const { halfWidth, halfLength, height } = TEST_ARENA_DIMENSIONS;
  const wallZ = zSign * (halfLength + WALL_HALF_THICKNESS);

  const sidePostWidth = (halfWidth - GOAL_HALF_WIDTH) / 2;
  const sidePostCentre = GOAL_HALF_WIDTH + sidePostWidth;

  // WS5.B seam fix: widen the goal-box side walls/roof and the side-post
  // segments so they overlap the end wall's own thickness instead of
  // meeting it edge-to-edge — overlapping static colliders are harmless in
  // Rapier, and this closes a seam cars/balls could otherwise phase
  // through at speed.
  //
  // G5 (plan/GAME_ENHANCEMENTS_PLAN.md): the ORIGINAL overlap direction was
  // the bug — both overlaps grew INTO the goal mouth instead of away from
  // it:
  //  - POST_OVERLAP shifted each post's centre toward the goal centreline,
  //    landing its inner edge at GOAL_HALF_WIDTH - 2*POST_OVERLAP (6.5, not
  //    7) — an invisible 0.5m lip inside each side of the goal mouth.
  //  - SEAM_OVERLAP shifted the goal-box side walls/roof 0.5m INTO the
  //    field (their near face at halfLength - SEAM_OVERLAP = 29, a full
  //    metre inside the end wall's z=30 plane) — the roof piece is exactly
  //    "the invisible wall above the goal": y in [GOAL_HEIGHT,
  //    GOAL_HEIGHT+WALL_HALF_THICKNESS], z in [29, 30], spanning the goal
  //    mouth's width.
  // Both are now widened OUTWARD/BEHIND the wall plane instead: posts grow
  // away from the goal centreline (inner edge lands exactly on
  // GOAL_HALF_WIDTH), and the goal-box side/roof pieces grow further behind
  // the end wall (never in front of it) while still overlapping the wall's
  // own thickness at the join.
  const SEAM_OVERLAP = 0.5;
  const POST_OVERLAP = 0.25;
  const boxSideZHalfExtent = GOAL_DEPTH / 2 + SEAM_OVERLAP / 2;
  const boxSideZCentre = zSign * (halfLength + GOAL_DEPTH / 2 + SEAM_OVERLAP / 2);

  const colliders: ArenaColliderSpec[] = [
    // Left goal post wall segment.
    {
      halfExtents: { x: sidePostWidth + POST_OVERLAP, y: height / 2, z: WALL_HALF_THICKNESS },
      translation: { x: -(sidePostCentre + POST_OVERLAP), y: height / 2, z: wallZ }
    },
    // Right goal post wall segment.
    {
      halfExtents: { x: sidePostWidth + POST_OVERLAP, y: height / 2, z: WALL_HALF_THICKNESS },
      translation: { x: sidePostCentre + POST_OVERLAP, y: height / 2, z: wallZ }
    },
    // Header above the goal mouth.
    {
      halfExtents: { x: halfWidth, y: (height - GOAL_HEIGHT) / 2, z: WALL_HALF_THICKNESS },
      translation: { x: 0, y: GOAL_HEIGHT + (height - GOAL_HEIGHT) / 2, z: wallZ }
    },
    // Goal box back wall (catches a scored ball).
    {
      halfExtents: { x: GOAL_HALF_WIDTH, y: GOAL_HEIGHT / 2, z: WALL_HALF_THICKNESS },
      translation: {
        x: 0,
        y: GOAL_HEIGHT / 2,
        z: zSign * (halfLength + GOAL_DEPTH + WALL_HALF_THICKNESS)
      }
    },
    // Goal box left side wall.
    {
      halfExtents: { x: WALL_HALF_THICKNESS, y: GOAL_HEIGHT / 2, z: boxSideZHalfExtent },
      translation: {
        x: -(GOAL_HALF_WIDTH + WALL_HALF_THICKNESS),
        y: GOAL_HEIGHT / 2,
        z: boxSideZCentre
      }
    },
    // Goal box right side wall.
    {
      halfExtents: { x: WALL_HALF_THICKNESS, y: GOAL_HEIGHT / 2, z: boxSideZHalfExtent },
      translation: {
        x: GOAL_HALF_WIDTH + WALL_HALF_THICKNESS,
        y: GOAL_HEIGHT / 2,
        z: boxSideZCentre
      }
    },
    // Goal box roof.
    {
      halfExtents: { x: GOAL_HALF_WIDTH, y: WALL_HALF_THICKNESS, z: boxSideZHalfExtent },
      translation: {
        x: 0,
        y: GOAL_HEIGHT + WALL_HALF_THICKNESS,
        z: boxSideZCentre
      }
    },
    // Goal box floor patch (extends the main floor under the goal box).
    {
      halfExtents: { x: GOAL_HALF_WIDTH, y: FLOOR_THICKNESS / 2, z: GOAL_DEPTH / 2 },
      translation: {
        x: 0,
        y: -FLOOR_THICKNESS / 2,
        z: zSign * (halfLength + GOAL_DEPTH / 2)
      }
    }
  ];

  const sensor: GoalSensorDefinition = {
    defendingTeam,
    centre: { x: 0, y: GOAL_HEIGHT / 2, z: zSign * (halfLength + GOAL_DEPTH / 2) },
    halfExtents: { x: GOAL_HALF_WIDTH - 0.1, y: GOAL_HEIGHT / 2 - 0.1, z: GOAL_DEPTH / 2 }
  };

  return { colliders, sensor };
}

/**
 * R1 (plan/RAMPS_AND_FEATURES_PLAN.md): floor->wall fillets AND curved
 * wall-wall corners, generated by the shared `ArenaRampGeometry` module
 * that also drives the rendered ramp/corner meshes — see that module's
 * doc comment and docs/physics-deviations.md's "Arena ramps v2" section
 * for why a shared generator replaced the old physics-only `fillet()`.
 * The suspension probes (which already cast along car-local down, see
 * `SuspensionController.ts`) treat each segment as just another static
 * surface, so no suspension code changes were needed, only the geometry
 * to drive onto.
 */
function rampColliders(): ArenaColliderSpec[] {
  const { halfWidth, halfLength, height } = TEST_ARENA_DIMENSIONS;
  return generateArenaRamps({ halfWidth, halfLength, height, goalHalfWidth: GOAL_HALF_WIDTH }).map(
    (spec) => ({
      halfExtents: spec.halfExtents,
      translation: spec.translation,
      rotation: spec.rotation
    })
  );
}

function boxArenaColliders(): { colliders: ArenaColliderSpec[]; goalSensors: GoalSensorDefinition[] } {
  const { halfWidth, halfLength, height } = TEST_ARENA_DIMENSIONS;

  const playerEnd = buildGoalEnd(-1, "player");
  const opponentEnd = buildGoalEnd(1, "opponent");

  return {
    colliders: [
      floorCollider(),
      {
        // Left wall
        halfExtents: { x: WALL_HALF_THICKNESS, y: height / 2, z: halfLength },
        translation: { x: -halfWidth - WALL_HALF_THICKNESS, y: height / 2, z: 0 }
      },
      {
        // Right wall
        halfExtents: { x: WALL_HALF_THICKNESS, y: height / 2, z: halfLength },
        translation: { x: halfWidth + WALL_HALF_THICKNESS, y: height / 2, z: 0 }
      },
      ...playerEnd.colliders,
      ...opponentEnd.colliders,
      {
        // Ceiling
        halfExtents: { x: halfWidth + 1, y: 0.5, z: halfLength },
        translation: { x: 0, y: height + 0.5, z: 0 }
      },
      ...rampColliders()
    ],
    goalSensors: [playerEnd.sensor, opponentEnd.sensor]
  };
}

export function getArenaPresetDefinition(preset: ArenaPreset): ArenaPresetDefinition {
  switch (preset) {
    case "flat-plane":
      return { preset, colliders: [floorCollider()], goalSensors: [] };
    case "box-arena": {
      const { colliders, goalSensors } = boxArenaColliders();
      return { preset, colliders, goalSensors };
    }
  }
}
