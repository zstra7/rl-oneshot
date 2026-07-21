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
}

export interface ArenaPresetDefinition {
  readonly preset: ArenaPreset;
  readonly colliders: readonly ArenaColliderSpec[];
}

const FLOOR_THICKNESS = 1;

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

function boxArenaColliders(): ArenaColliderSpec[] {
  const { halfWidth, halfLength, height } = TEST_ARENA_DIMENSIONS;

  return [
    floorCollider(),
    {
      // Left wall
      halfExtents: { x: 0.5, y: height / 2, z: halfLength },
      translation: { x: -halfWidth - 0.5, y: height / 2, z: 0 }
    },
    {
      // Right wall
      halfExtents: { x: 0.5, y: height / 2, z: halfLength },
      translation: { x: halfWidth + 0.5, y: height / 2, z: 0 }
    },
    {
      // Back wall (player end, solid — no goal opening in the physics
      // test arena; goal sensors are a future match-flow concern)
      halfExtents: { x: halfWidth, y: height / 2, z: 0.5 },
      translation: { x: 0, y: height / 2, z: -halfLength - 0.5 }
    },
    {
      // Front wall (opponent end)
      halfExtents: { x: halfWidth, y: height / 2, z: 0.5 },
      translation: { x: 0, y: height / 2, z: halfLength + 0.5 }
    },
    {
      // Ceiling
      halfExtents: { x: halfWidth + 1, y: 0.5, z: halfLength },
      translation: { x: 0, y: height + 0.5, z: 0 }
    }
  ];
}

export function getArenaPresetDefinition(preset: ArenaPreset): ArenaPresetDefinition {
  switch (preset) {
    case "flat-plane":
      return { preset, colliders: [floorCollider()] };
    case "box-arena":
      return { preset, colliders: boxArenaColliders() };
  }
}
