import { FULL_PAD_SENSOR, SMALL_PAD_SENSOR, type BoostPadDefinition } from "@/physics/boost/BoostPadTypes";

/**
 * Deterministic 6-small/4-full layout (Master Brief Phase 6, reduced by
 * F8 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md) per user request),
 * symmetric about both field axes. Not regulation Rocket League
 * coordinates — this project uses its own arena scale (physics spec
 * section 2.3: no specific stadium mesh is assumed) — see
 * docs/physics-deviations.md.
 */
export function createDefaultBoostPadLayout(floorTopY = 0): readonly BoostPadDefinition[] {
  // F8: the original 12-pad grid (x in {-14,0,14} * z in {-20,-7,7,20})
  // removed the two centre-circle-adjacent pads (0,-7)/(0,7) and the four
  // pads sitting right next to the big corner pads ((-14,-20),(14,-20),
  // (-14,20),(14,20)) — locked user decision. Explicit coordinate list
  // (not the old nested-loop grid) so the removed positions are visible
  // at a glance rather than requiring a diff against the old bounds.
  const smallPositions: ReadonlyArray<readonly [number, number]> = [
    [-14, -7],
    [14, -7],
    [-14, 7],
    [14, 7],
    [0, -20],
    [0, 20]
  ];

  const definitions: BoostPadDefinition[] = [];

  // The sensor cylinder is centred on `position`, so its bottom sits on
  // the floor (position.y = floorTopY + halfHeight) rather than being
  // buried through it — a buried pad previously made the suspension
  // probe's shape-cast think it was hitting solid ground, corrupting
  // suspension forces near pad positions. See docs/physics-deviations.md.
  smallPositions.forEach(([x, z], smallIndex) => {
    definitions.push({
      id: `boost-small-${smallIndex}`,
      type: "small",
      position: { x, y: floorTopY + SMALL_PAD_SENSOR.pickupHalfHeight, z },
      pickupRadius: SMALL_PAD_SENSOR.pickupRadius,
      pickupHalfHeight: SMALL_PAD_SENSOR.pickupHalfHeight
    });
  });

  const fullPositions: ReadonlyArray<readonly [number, number]> = [
    [-10, -26],
    [10, -26],
    [-10, 26],
    [10, 26]
  ];

  fullPositions.forEach(([x, z], index) => {
    definitions.push({
      id: `boost-full-${index}`,
      type: "full",
      position: { x, y: floorTopY + FULL_PAD_SENSOR.pickupHalfHeight, z },
      pickupRadius: FULL_PAD_SENSOR.pickupRadius,
      pickupHalfHeight: FULL_PAD_SENSOR.pickupHalfHeight
    });
  });

  return definitions;
}
