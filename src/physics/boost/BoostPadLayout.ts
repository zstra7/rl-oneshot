import { FULL_PAD_SENSOR, SMALL_PAD_SENSOR, type BoostPadDefinition } from "@/physics/boost/BoostPadTypes";

/**
 * Deterministic 12-small/4-full layout (Master Brief Phase 6), symmetric
 * about both field axes. Not regulation Rocket League coordinates — this
 * project uses its own arena scale (physics spec section 2.3: no specific
 * stadium mesh is assumed) — see docs/physics-deviations.md.
 */
export function createDefaultBoostPadLayout(floorTopY = 0): readonly BoostPadDefinition[] {
  const smallX = [-14, 0, 14];
  const smallZ = [-20, -7, 7, 20];

  const definitions: BoostPadDefinition[] = [];

  // The sensor cylinder is centred on `position`, so its bottom sits on
  // the floor (position.y = floorTopY + halfHeight) rather than being
  // buried through it — a buried pad previously made the suspension
  // probe's shape-cast think it was hitting solid ground, corrupting
  // suspension forces near pad positions. See docs/physics-deviations.md.
  let smallIndex = 0;
  for (const z of smallZ) {
    for (const x of smallX) {
      definitions.push({
        id: `boost-small-${smallIndex}`,
        type: "small",
        position: { x, y: floorTopY + SMALL_PAD_SENSOR.pickupHalfHeight, z },
        pickupRadius: SMALL_PAD_SENSOR.pickupRadius,
        pickupHalfHeight: SMALL_PAD_SENSOR.pickupHalfHeight
      });
      smallIndex += 1;
    }
  }

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
