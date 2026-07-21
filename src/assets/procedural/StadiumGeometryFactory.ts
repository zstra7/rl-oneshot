import * as THREE from "three";

import { createHexShellTexture } from "@/assets/procedural/HexPatternTexture";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";
import { applyVertexJitter } from "@/visual-language/VertexJitter";

const WALL_THICKNESS = 1;
/** Meshes drawn after all opaque geometry, so the transparent shell never fights the floor/ribs for depth order. */
const SHELL_RENDER_ORDER = 10;

/**
 * Rectangular blockout (Master Brief Phase 2) plus Phase 14's floor
 * markings and structural ribs (PSX visual spec sections 13/36), and
 * WS5's (plan/POLISH_OVERHAUL_PLAN.md) transparent hex-pattern glass
 * shell + enclosed goal boxes. Curved corner/wall-ceiling fillets are
 * handled separately by `createWallFillets` (WS5.C) — see
 * docs/visual-language-deviations.md Phase 14 for what's still deferred.
 */
export function createStadiumBlockout(context: ProceduralAssetContext): THREE.Group {
  const { fieldLength, fieldWidth, interiorHeight } = context.stadiumDimensions;

  const root = new THREE.Group();
  root.name = "StadiumVisualRoot";

  const floorTexture = context.stadiumTextures?.floor;

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

  applyVertexJitter(floorMaterial, "arenaMetal");

  // WS5.A: side walls, ceiling and end walls are a shared transparent
  // "glass shell" material (hex-pattern texture) instead of the old
  // opaque concrete wall texture — the floor stays opaque (WS8
  // retextures it) and the structural ribs stay opaque too, reading as
  // the frame holding the glass up.
  const glassMaterial = context.materialRegistry.getOrCreate("stadium-glass-shell-v1", () => {
    const hexTexture = createHexShellTexture();
    hexTexture.repeat.set(10, 10);
    return new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      map: hexTexture,
      transparent: true,
      opacity: 0.16,
      roughness: 0.15,
      metalness: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  });

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

  const leftWall = new THREE.Mesh(sideWallGeometry, glassMaterial);
  leftWall.name = "SideWallLeft";
  leftWall.position.set(-fieldWidth / 2 - WALL_THICKNESS / 2, interiorHeight / 2, 0);
  leftWall.renderOrder = SHELL_RENDER_ORDER;
  root.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeometry, glassMaterial);
  rightWall.name = "SideWallRight";
  rightWall.position.set(fieldWidth / 2 + WALL_THICKNESS / 2, interiorHeight / 2, 0);
  rightWall.renderOrder = SHELL_RENDER_ORDER;
  root.add(rightWall);

  const ceilingGeometry = context.geometryRegistry.getOrCreate(
    "stadium-ceiling-v1",
    () => new THREE.BoxGeometry(fieldWidth + WALL_THICKNESS * 2, WALL_THICKNESS, fieldLength)
  );
  const ceiling = new THREE.Mesh(ceilingGeometry, glassMaterial);
  ceiling.name = "Ceiling";
  ceiling.position.set(0, interiorHeight + WALL_THICKNESS / 2, 0);
  ceiling.renderOrder = SHELL_RENDER_ORDER;
  root.add(ceiling);

  root.add(createEndWallWithGoalGap(context, glassMaterial, "EndWallPlayer", -1));
  root.add(createEndWallWithGoalGap(context, glassMaterial, "EndWallOpponent", 1));

  root.add(createGoalBoxShell(context, glassMaterial, "GoalBoxPlayerShell", -1, VISUAL_PALETTE.playerCyan));
  root.add(createGoalBoxShell(context, glassMaterial, "GoalBoxOpponentShell", 1, VISUAL_PALETTE.opponentMagenta));

  root.add(createFloorMarkings(context));
  root.add(createStructuralRibs(context));
  root.add(createWallFillets(context, floorMaterial));

  return root;
}

const FILLET_RADIUS = 2.0;

/**
 * WS5.C: quarter-cylinder strips visually matching the physics fillet
 * colliders in `TestArenaPresets.filletColliders` — same radius, same
 * runs (full length along both side walls; two shorter runs per end
 * wall either side of the goal mouth). Uses the floor material so the
 * fillet reads as the floor curving up into the wall, rather than a
 * distinct third surface.
 */
function createWallFillets(context: ProceduralAssetContext, floorMaterial: THREE.Material): THREE.Group {
  const { fieldLength, fieldWidth, goalWidth } = context.stadiumDimensions;
  const halfWidth = fieldWidth / 2;
  const halfLength = fieldLength / 2;
  const goalHalfWidth = goalWidth / 2;
  const R = FILLET_RADIUS;

  const group = new THREE.Group();
  group.name = "WallFillets";

  const sideGeometry = context.geometryRegistry.getOrCreate(
    "stadium-fillet-side-v1",
    () => new THREE.CylinderGeometry(R, R, fieldLength, 12, 1, true, 0, Math.PI / 2)
  );

  // Left wall: arc centre line at (-(halfWidth - R), R), axis along Z.
  const leftFillet = new THREE.Mesh(sideGeometry, floorMaterial);
  leftFillet.position.set(-(halfWidth - R), R, 0);
  leftFillet.rotation.set(Math.PI / 2, 0, Math.PI);
  group.add(leftFillet);

  // Right wall: mirrored.
  const rightFillet = new THREE.Mesh(sideGeometry, floorMaterial);
  rightFillet.position.set(halfWidth - R, R, 0);
  rightFillet.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  group.add(rightFillet);

  const endRunLength = halfWidth - goalHalfWidth;
  const endGeometry = context.geometryRegistry.getOrCreate(
    "stadium-fillet-end-v1",
    () => new THREE.CylinderGeometry(R, R, endRunLength, 12, 1, true, 0, Math.PI / 2)
  );

  for (const zSign of [-1, 1] as const) {
    for (const xSign of [-1, 1] as const) {
      const runCentreX = xSign * ((halfWidth + goalHalfWidth) / 2);
      const endFillet = new THREE.Mesh(endGeometry, floorMaterial);
      endFillet.position.set(runCentreX, R, zSign * (halfLength - R));
      // Cylinder axis (local Y) rotated onto world X (the run direction);
      // the quarter-arc sweep then needs to face into the field along Z.
      endFillet.rotation.set(0, 0, Math.PI / 2);
      endFillet.rotateY(zSign === -1 ? 0 : Math.PI);
      group.add(endFillet);
    }
  }

  return group;
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
  leftSegment.renderOrder = SHELL_RENDER_ORDER;
  group.add(leftSegment);

  const rightSegment = new THREE.Mesh(sideGeometry, material);
  rightSegment.position.set(
    goalWidth / 2 + sideSegmentWidth / 2,
    interiorHeight / 2,
    zPosition
  );
  rightSegment.renderOrder = SHELL_RENDER_ORDER;
  group.add(rightSegment);

  const lintelHeight = interiorHeight - goalHeight;

  if (lintelHeight > 0) {
    const lintelGeometry = context.geometryRegistry.getOrCreate(
      "stadium-end-wall-lintel-v1",
      () => new THREE.BoxGeometry(goalWidth, lintelHeight, WALL_THICKNESS)
    );
    const lintel = new THREE.Mesh(lintelGeometry, material);
    lintel.position.set(0, goalHeight + lintelHeight / 2, zPosition);
    lintel.renderOrder = SHELL_RENDER_ORDER;
    group.add(lintel);
  }

  return group;
}

const GOAL_FRAME_SECTION = 0.15;

/**
 * WS5.B: enclosed goal visuals — back wall, two side walls and a roof,
 * mirroring `TestArenaPresets.buildGoalEnd`'s physics goal-box colliders
 * (same field half-length and goal half-width/height/depth), plus a thin
 * emissive frame outlining the goal mouth in the defending team's colour.
 */
function createGoalBoxShell(
  context: ProceduralAssetContext,
  material: THREE.Material,
  name: string,
  zSign: -1 | 1,
  frameColor: string
): THREE.Group {
  const { fieldLength, goalWidth, goalHeight, goalDepth } = context.stadiumDimensions;
  const halfLength = fieldLength / 2;

  const group = new THREE.Group();
  group.name = name;

  const backWallGeometry = context.geometryRegistry.getOrCreate(
    "stadium-goalbox-back-v1",
    () => new THREE.BoxGeometry(goalWidth, goalHeight, WALL_THICKNESS)
  );
  const backWall = new THREE.Mesh(backWallGeometry, material);
  backWall.position.set(0, goalHeight / 2, zSign * (halfLength + goalDepth));
  backWall.renderOrder = SHELL_RENDER_ORDER;
  group.add(backWall);

  const sideWallGeometry = context.geometryRegistry.getOrCreate(
    "stadium-goalbox-side-v1",
    () => new THREE.BoxGeometry(WALL_THICKNESS, goalHeight, goalDepth)
  );
  for (const xSign of [-1, 1] as const) {
    const sideWall = new THREE.Mesh(sideWallGeometry, material);
    sideWall.position.set(
      xSign * (goalWidth / 2 + WALL_THICKNESS / 2),
      goalHeight / 2,
      zSign * (halfLength + goalDepth / 2)
    );
    sideWall.renderOrder = SHELL_RENDER_ORDER;
    group.add(sideWall);
  }

  const roofGeometry = context.geometryRegistry.getOrCreate(
    "stadium-goalbox-roof-v1",
    () => new THREE.BoxGeometry(goalWidth, WALL_THICKNESS, goalDepth)
  );
  const roof = new THREE.Mesh(roofGeometry, material);
  roof.position.set(0, goalHeight + WALL_THICKNESS / 2, zSign * (halfLength + goalDepth / 2));
  roof.renderOrder = SHELL_RENDER_ORDER;
  group.add(roof);

  group.add(createGoalFrame(context, name, zSign, halfLength, goalWidth, goalHeight, frameColor));

  return group;
}

/** Four thin emissive box meshes outlining the goal mouth. */
function createGoalFrame(
  context: ProceduralAssetContext,
  name: string,
  zSign: -1 | 1,
  halfLength: number,
  goalWidth: number,
  goalHeight: number,
  frameColor: string
): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}Frame`;

  const frameMaterial = context.materialRegistry.getOrCreate(
    `stadium-goal-frame-v1-${frameColor}`,
    () => new THREE.MeshBasicMaterial({ color: frameColor })
  );

  const frameZ = zSign * halfLength;

  const horizontalGeometry = context.geometryRegistry.getOrCreate(
    "stadium-goal-frame-horizontal-v1",
    () => new THREE.BoxGeometry(goalWidth + GOAL_FRAME_SECTION, GOAL_FRAME_SECTION, GOAL_FRAME_SECTION)
  );
  const top = new THREE.Mesh(horizontalGeometry, frameMaterial);
  top.position.set(0, goalHeight, frameZ);
  group.add(top);

  const bottom = new THREE.Mesh(horizontalGeometry, frameMaterial);
  bottom.position.set(0, 0, frameZ);
  group.add(bottom);

  const verticalGeometry = context.geometryRegistry.getOrCreate(
    "stadium-goal-frame-vertical-v1",
    () => new THREE.BoxGeometry(GOAL_FRAME_SECTION, goalHeight, GOAL_FRAME_SECTION)
  );
  for (const xSign of [-1, 1] as const) {
    const post = new THREE.Mesh(verticalGeometry, frameMaterial);
    post.position.set(xSign * (goalWidth / 2), goalHeight / 2, frameZ);
    group.add(post);
  }

  return group;
}
