import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";
import { applyVertexJitter } from "@/visual-language/VertexJitter";

const WALL_THICKNESS = 1;

/**
 * Rectangular blockout (Master Brief Phase 2) plus Phase 14's floor
 * markings and structural ribs (PSX visual spec sections 13/36).
 * Curved corner/wall-ceiling transitions and the segmented transparent
 * glass shell (spec sections 13, 37-38) remain out of scope — see
 * docs/visual-language-deviations.md Phase 14.
 */
export function createStadiumBlockout(context: ProceduralAssetContext): THREE.Group {
  const { fieldLength, fieldWidth, interiorHeight } = context.stadiumDimensions;

  const root = new THREE.Group();
  root.name = "StadiumVisualRoot";

  const floorTexture = context.stadiumTextures?.floor;
  const wallTexture = context.stadiumTextures?.wall;

  const floorMaterial = context.materialRegistry.getOrCreate(
    `stadium-floor-v2-${floorTexture ? "textured" : "flat"}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: floorTexture ? 0xffffff : 0x11131a,
        map: floorTexture ?? null,
        roughness: 0.85,
        metalness: 0.05
      })
  );
  if (floorTexture) {
    floorTexture.repeat.set(fieldWidth / 2, fieldLength / 2);
  }

  const wallMaterial = context.materialRegistry.getOrCreate(
    `stadium-wall-v2-${wallTexture ? "textured" : "flat"}`,
    () =>
      new THREE.MeshStandardMaterial({
        color: wallTexture ? 0xffffff : 0x1c1f2b,
        map: wallTexture ?? null,
        roughness: 0.7,
        metalness: 0.15
      })
  );
  if (wallTexture) {
    wallTexture.repeat.set(fieldLength / 2, interiorHeight / 2);
  }

  applyVertexJitter(floorMaterial, "arenaMetal");
  applyVertexJitter(wallMaterial, "arenaMetal");

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

  root.add(createFloorMarkings(context));
  root.add(createStructuralRibs(context));

  return root;
}

const MARKING_HEIGHT_OFFSET = 0.011;
const MARKING_LINE_WIDTH = 0.35;

/**
 * PSX visual spec section 13: "wide emissive centre line, centre circle,
 * goal-box markings" — flat, unlit, team-neutral (`paleMetal`) emissive-
 * looking lines laid just above the floor to avoid z-fighting.
 */
function createFloorMarkings(context: ProceduralAssetContext): THREE.Group {
  const { fieldLength, fieldWidth, goalWidth } = context.stadiumDimensions;

  const group = new THREE.Group();
  group.name = "FloorMarkings";

  const lineMaterial = context.materialRegistry.getOrCreate(
    "stadium-marking-line-v1",
    () => new THREE.MeshBasicMaterial({ color: VISUAL_PALETTE.paleMetal, transparent: true, opacity: 0.55 })
  );
  applyVertexJitter(lineMaterial, "goalOutlines");

  const centreLineGeometry = context.geometryRegistry.getOrCreate(
    "stadium-marking-centre-line-v1",
    () => new THREE.PlaneGeometry(fieldWidth, MARKING_LINE_WIDTH)
  );
  const centreLine = new THREE.Mesh(centreLineGeometry, lineMaterial);
  centreLine.name = "CentreLine";
  centreLine.rotation.x = -Math.PI / 2;
  centreLine.position.set(0, MARKING_HEIGHT_OFFSET, 0);
  group.add(centreLine);

  const centreCircleRadius = Math.min(fieldWidth, fieldLength) * 0.14;
  const centreCircleGeometry = context.geometryRegistry.getOrCreate(
    "stadium-marking-centre-circle-v1",
    () => new THREE.RingGeometry(centreCircleRadius - MARKING_LINE_WIDTH / 2, centreCircleRadius + MARKING_LINE_WIDTH / 2, 32)
  );
  const centreCircle = new THREE.Mesh(centreCircleGeometry, lineMaterial);
  centreCircle.name = "CentreCircle";
  centreCircle.rotation.x = -Math.PI / 2;
  centreCircle.position.set(0, MARKING_HEIGHT_OFFSET, 0);
  group.add(centreCircle);

  const goalBoxDepth = fieldLength * 0.12;
  const goalBoxWidth = goalWidth * 1.6;

  for (const zSign of [-1, 1] as const) {
    const boxGroup = new THREE.Group();
    boxGroup.name = zSign === -1 ? "GoalBoxPlayer" : "GoalBoxOpponent";

    const boxZ = zSign * (fieldLength / 2 - goalBoxDepth / 2);

    const frontEdgeGeometry = context.geometryRegistry.getOrCreate(
      "stadium-marking-goalbox-front-v1",
      () => new THREE.PlaneGeometry(goalBoxWidth, MARKING_LINE_WIDTH)
    );
    const frontEdge = new THREE.Mesh(frontEdgeGeometry, lineMaterial);
    frontEdge.rotation.x = -Math.PI / 2;
    frontEdge.position.set(0, MARKING_HEIGHT_OFFSET, boxZ - (zSign * goalBoxDepth) / 2);
    boxGroup.add(frontEdge);

    const sideEdgeGeometry = context.geometryRegistry.getOrCreate(
      "stadium-marking-goalbox-side-v1",
      () => new THREE.PlaneGeometry(MARKING_LINE_WIDTH, goalBoxDepth)
    );
    for (const xSign of [-1, 1] as const) {
      const sideEdge = new THREE.Mesh(sideEdgeGeometry, lineMaterial);
      sideEdge.rotation.x = -Math.PI / 2;
      sideEdge.position.set(xSign * (goalBoxWidth / 2), MARKING_HEIGHT_OFFSET, boxZ);
      boxGroup.add(sideEdge);
    }

    group.add(boxGroup);
  }

  return group;
}

const RIB_SPACING = 4;
const RIB_WIDTH = 0.4;
const RIB_DEPTH = 0.5;

/**
 * PSX visual spec section 13: evenly-spaced vertical structural ribs
 * along both side walls, "thick enough to read at 320x180" and never
 * blocking the goal openings (ribs are only placed along the two side
 * walls, which never contain a goal gap).
 */
function createStructuralRibs(context: ProceduralAssetContext): THREE.Group {
  const { fieldLength, fieldWidth, interiorHeight } = context.stadiumDimensions;

  const group = new THREE.Group();
  group.name = "StructuralRibs";

  const ribMaterial = context.materialRegistry.getOrCreate(
    "stadium-rib-v1",
    () => new THREE.MeshStandardMaterial({ color: 0x0c0e15, roughness: 0.6, metalness: 0.4 })
  );
  applyVertexJitter(ribMaterial, "arenaMetal");

  const ribGeometry = context.geometryRegistry.getOrCreate(
    "stadium-rib-v1",
    () => new THREE.BoxGeometry(RIB_WIDTH, interiorHeight, RIB_DEPTH)
  );

  const ribCount = Math.max(2, Math.floor(fieldLength / RIB_SPACING));
  const instanced = new THREE.InstancedMesh(ribGeometry, ribMaterial, ribCount * 2);
  instanced.name = "SideWallRibs";

  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let i = 0; i < ribCount; i += 1) {
    const z = -fieldLength / 2 + (i + 0.5) * (fieldLength / ribCount);

    matrix.makeTranslation(-fieldWidth / 2 - RIB_WIDTH / 2, interiorHeight / 2, z);
    instanced.setMatrixAt(index, matrix);
    index += 1;

    matrix.makeTranslation(fieldWidth / 2 + RIB_WIDTH / 2, interiorHeight / 2, z);
    instanced.setMatrixAt(index, matrix);
    index += 1;
  }
  instanced.instanceMatrix.needsUpdate = true;

  group.add(instanced);
  return group;
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
