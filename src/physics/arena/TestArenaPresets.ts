import type { TeamId } from "@/core/TeamTypes";
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

  // WS5.B seam fix: widen the goal-box side walls/roof by 0.5 in z (and
  // shift their centre correspondingly) so they overlap *inside* the end
  // wall's plane instead of meeting it edge-to-edge, and widen the
  // side-post segments by 0.25 toward the goal centreline for the same
  // reason — overlapping static colliders are harmless in Rapier, and
  // this closes a seam cars/balls could otherwise phase through at speed.
  const SEAM_OVERLAP = 0.5;
  const POST_OVERLAP = 0.25;
  const boxSideZHalfExtent = GOAL_DEPTH / 2 + SEAM_OVERLAP;
  const boxSideZCentre = zSign * (halfLength + GOAL_DEPTH / 2 - SEAM_OVERLAP);

  const colliders: ArenaColliderSpec[] = [
    // Left goal post wall segment.
    {
      halfExtents: { x: sidePostWidth + POST_OVERLAP, y: height / 2, z: WALL_HALF_THICKNESS },
      translation: { x: -sidePostCentre + POST_OVERLAP, y: height / 2, z: wallZ }
    },
    // Right goal post wall segment.
    {
      halfExtents: { x: sidePostWidth + POST_OVERLAP, y: height / 2, z: WALL_HALF_THICKNESS },
      translation: { x: sidePostCentre - POST_OVERLAP, y: height / 2, z: wallZ }
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

const FILLET_RADIUS = 2.0;
const FILLET_SEGMENTS = 5;
const FILLET_SEG_HALF_THICK = 0.12;

/** Quaternion for a rotation of `angle` radians about the Z axis. */
function quatAxisZ(angle: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
}

/** Quaternion for a rotation of `angle` radians about the X axis. */
function quatAxisX(angle: number): { x: number; y: number; z: number; w: number } {
  return { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
}

/**
 * WS5.C (plan/POLISH_OVERHAUL_PLAN.md): quarter-round strips replacing the
 * sharp 90° floor/wall junction with a fillet the car can drive up. Each
 * fillet is a run of `FILLET_SEGMENTS` short flat boxes approximating the
 * arc — the suspension probes (which already cast along car-local down,
 * see `SuspensionController.ts`) treat each segment as just another
 * static surface, so no suspension code changes were needed, only the
 * geometry to drive onto.
 *
 * Side-wall fillets run the full arena length; end-wall fillets are split
 * into two shorter runs either side of the goal mouth so the goal opening
 * stays clear. `sign` is the wall's own outward-normal sign along its
 * primary axis (-1 for the left/near-Z wall, +1 for the right/far-Z
 * wall); `axis` picks which world axis the arc bends across.
 */
function fillet(
  axis: "x" | "z",
  sign: -1 | 1,
  wallPlaneCoordinate: number,
  runHalfExtent: number,
  runCentre: number
): ArenaColliderSpec[] {
  const R = FILLET_RADIUS;
  const chordHalf = ((R * (Math.PI / 2)) / FILLET_SEGMENTS) * 0.6;

  const specs: ArenaColliderSpec[] = [];
  for (let i = 0; i < FILLET_SEGMENTS; i += 1) {
    const theta = (i + 0.5) * (Math.PI / 2 / FILLET_SEGMENTS);
    const arcCoordinate =
      sign * (wallPlaneCoordinate - R) + sign * (R - FILLET_SEG_HALF_THICK) * Math.sin(theta);
    const y = R - (R - FILLET_SEG_HALF_THICK) * Math.cos(theta);
    const angle = sign * theta;

    if (axis === "x") {
      specs.push({
        halfExtents: { x: chordHalf, y: FILLET_SEG_HALF_THICK, z: runHalfExtent },
        translation: { x: arcCoordinate, y, z: runCentre },
        rotation: quatAxisZ(angle)
      });
    } else {
      specs.push({
        halfExtents: { x: runHalfExtent, y: FILLET_SEG_HALF_THICK, z: chordHalf },
        translation: { x: runCentre, y, z: arcCoordinate },
        rotation: quatAxisX(angle)
      });
    }
  }
  return specs;
}

function filletColliders(): ArenaColliderSpec[] {
  const { halfWidth, halfLength } = TEST_ARENA_DIMENSIONS;

  const sideWallFillets = [
    ...fillet("x", -1, halfWidth, halfLength, 0),
    ...fillet("x", 1, halfWidth, halfLength, 0)
  ];

  const endRunHalfExtent = (halfWidth - GOAL_HALF_WIDTH) / 2;
  const endRunCentre = (halfWidth + GOAL_HALF_WIDTH) / 2;
  const endWallFillets = [
    ...fillet("z", -1, halfLength, endRunHalfExtent, -endRunCentre),
    ...fillet("z", -1, halfLength, endRunHalfExtent, endRunCentre),
    ...fillet("z", 1, halfLength, endRunHalfExtent, -endRunCentre),
    ...fillet("z", 1, halfLength, endRunHalfExtent, endRunCentre)
  ];

  return [...sideWallFillets, ...endWallFillets];
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
      ...filletColliders()
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
