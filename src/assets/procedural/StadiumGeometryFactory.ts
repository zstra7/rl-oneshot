import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";

const WALL_THICKNESS = 1;

/**
 * Basic rectangular blockout (Master Brief Phase 2: "basic stadium
 * blockout"). Curved corner transitions, structural ribs, glass layers,
 * and field-marking detail belong to Phase 14 (asset pipeline spec
 * sections 36-38) and are intentionally not built here.
 */
export function createStadiumBlockout(context: ProceduralAssetContext): THREE.Group {
  const { fieldLength, fieldWidth, interiorHeight } = context.stadiumDimensions;

  const root = new THREE.Group();
  root.name = "StadiumVisualRoot";

  const floorMaterial = context.materialRegistry.getOrCreate(
    "stadium-floor-v1",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x11131a,
        roughness: 0.85,
        metalness: 0.05
      })
  );

  const wallMaterial = context.materialRegistry.getOrCreate(
    "stadium-wall-v1",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x1c1f2b,
        roughness: 0.7,
        metalness: 0.15
      })
  );

  const floorGeometry = context.geometryRegistry.getOrCreate(
    "stadium-floor-panel-v1",
    () => new THREE.BoxGeometry(fieldWidth, WALL_THICKNESS, fieldLength)
  );
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = "FloorBase";
  floor.position.set(0, -WALL_THICKNESS / 2, 0);
  root.add(floor);

  const sideWallGeometry = context.geometryRegistry.getOrCreate(
    "stadium-side-wall-v1",
    () => new THREE.BoxGeometry(WALL_THICKNESS, interiorHeight, fieldLength)
  );

  const leftWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
  leftWall.name = "SideWallLeft";
  leftWall.position.set(-fieldWidth / 2 - WALL_THICKNESS / 2, interiorHeight / 2, 0);
  root.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeometry, wallMaterial);
  rightWall.name = "SideWallRight";
  rightWall.position.set(fieldWidth / 2 + WALL_THICKNESS / 2, interiorHeight / 2, 0);
  root.add(rightWall);

  const ceilingGeometry = context.geometryRegistry.getOrCreate(
    "stadium-ceiling-v1",
    () => new THREE.BoxGeometry(fieldWidth + WALL_THICKNESS * 2, WALL_THICKNESS, fieldLength)
  );
  const ceiling = new THREE.Mesh(ceilingGeometry, wallMaterial);
  ceiling.name = "Ceiling";
  ceiling.position.set(0, interiorHeight + WALL_THICKNESS / 2, 0);
  root.add(ceiling);

  root.add(createEndWallWithGoalGap(context, wallMaterial, "EndWallPlayer", -1));
  root.add(createEndWallWithGoalGap(context, wallMaterial, "EndWallOpponent", 1));

  return root;
}

function createEndWallWithGoalGap(
  context: ProceduralAssetContext,
  material: THREE.Material,
  name: string,
  zSign: -1 | 1
): THREE.Group {
  const { fieldLength, fieldWidth, interiorHeight, goalWidth, goalHeight } =
    context.stadiumDimensions;

  const group = new THREE.Group();
  group.name = name;

  const sideSegmentWidth = (fieldWidth - goalWidth) / 2;
  const zPosition = (zSign * (fieldLength + WALL_THICKNESS)) / 2;

  const sideGeometry = context.geometryRegistry.getOrCreate(
    "stadium-end-wall-side-v1",
    () => new THREE.BoxGeometry(sideSegmentWidth, interiorHeight, WALL_THICKNESS)
  );

  const leftSegment = new THREE.Mesh(sideGeometry, material);
  leftSegment.position.set(
    -(goalWidth / 2 + sideSegmentWidth / 2),
    interiorHeight / 2,
    zPosition
  );
  group.add(leftSegment);

  const rightSegment = new THREE.Mesh(sideGeometry, material);
  rightSegment.position.set(
    goalWidth / 2 + sideSegmentWidth / 2,
    interiorHeight / 2,
    zPosition
  );
  group.add(rightSegment);

  const lintelHeight = interiorHeight - goalHeight;

  if (lintelHeight > 0) {
    const lintelGeometry = context.geometryRegistry.getOrCreate(
      "stadium-end-wall-lintel-v1",
      () => new THREE.BoxGeometry(goalWidth, lintelHeight, WALL_THICKNESS)
    );
    const lintel = new THREE.Mesh(lintelGeometry, material);
    lintel.position.set(0, goalHeight + lintelHeight / 2, zPosition);
    group.add(lintel);
  }

  return group;
}
