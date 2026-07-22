import * as THREE from "three";

import { createHexShellTexture } from "@/assets/procedural/HexPatternTexture";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { CORNER_RADIUS, generateArenaRamps } from "@/physics/arena/ArenaRampGeometry";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";
import { GOAL_HALF_WIDTH } from "@/physics/goal/GoalTypes";
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

  // WS8.B (plan/POLISH_OVERHAUL_PLAN.md): the floor box itself is now a
  // flat, unmapped base (sides/underside only — its top face sits under
  // the paneled floor below) so it no longer needs the single tiled
  // floor texture `stadiumTextures.floor` provided.
  const floorMaterial = context.materialRegistry.getOrCreate("stadium-floor-base-v3", () => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x11131a,
      roughness: 0.85,
      metalness: 0.05
    });
    applyVertexJitter(material, "arenaMetal");
    return material;
  });

  // WS5.A: side walls, ceiling and end walls are a shared transparent
  // "glass shell" material (hex-pattern texture) instead of the old
  // opaque concrete wall texture — the floor stays opaque (WS8
  // retextures it) and the structural ribs stay opaque too, reading as
  // the frame holding the glass up.
  // R2 (plan/RAMPS_AND_FEATURES_PLAN.md): the hex pattern was too dark to
  // read — added `emissive`/`emissiveMap` (same texture, so the
  // transparent-black background between hex lines stays dark and only
  // the lines themselves glow) and raised opacity slightly. Still clearly
  // see-through, now visibly faint rather than invisible.
  const glassMaterial = context.materialRegistry.getOrCreate("stadium-glass-shell-v2", () => {
    const hexTexture = createHexShellTexture();
    hexTexture.repeat.set(10, 10);
    return new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      map: hexTexture,
      emissive: new THREE.Color(0x66d4ff),
      emissiveMap: hexTexture,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.28,
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

  root.add(createPaneledFloor(context));

  // R1 (plan/RAMPS_AND_FEATURES_PLAN.md): straight side walls are
  // shortened to meet the curved corner panels instead of interpenetrating
  // them at full length (avoids a double-alpha overlap seam where the
  // transparent glass would stack).
  const sideWallLength = fieldLength - 2 * CORNER_RADIUS;
  const sideWallGeometry = context.geometryRegistry.getOrCreate(
    "stadium-side-wall-v2",
    () => new THREE.BoxGeometry(WALL_THICKNESS, interiorHeight, sideWallLength)
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
  root.add(createArenaRamps(context, glassMaterial));

  return root;
}

/**
 * R1 (plan/RAMPS_AND_FEATURES_PLAN.md): floor->wall ramps and curved
 * wall-wall corners, generated by the same `ArenaRampGeometry` module
 * that drives the physics colliders (`TestArenaPresets.ts`) — what you
 * see is exactly what you drive on, eliminating the visual/physics
 * mismatch that caused the original ghost ramp / invisible ramp /
 * backwards-ramp bugs (see docs/physics-deviations.md's "Arena ramps v2"
 * section for the full root-cause writeup). Dimensions come directly
 * from the physics-authoritative constants, not `context.stadiumDimensions`
 * — see the dims-consistency unit test pinning the two in sync.
 */
function createArenaRamps(context: ProceduralAssetContext, cornerGlassMaterial: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = "ArenaRamps";

  const { halfWidth, halfLength, height } = TEST_ARENA_DIMENSIONS;
  const specs = generateArenaRamps({ halfWidth, halfLength, height, goalHalfWidth: GOAL_HALF_WIDTH });

  // "Ramps as visible as the floor": reuse the floor's own concrete
  // texture family rather than the near-black unmapped base the WS8
  // floor rework introduced (which made the old fillets read as "really
  // dark"), with a light, never-dark fallback if no texture loaded.
  const rampTexture = context.stadiumTextures?.floorPanelSet?.[0];
  const rampMaterial = context.materialRegistry.getOrCreate(
    `stadium-ramp-v1-${rampTexture ? "textured" : "flat"}`,
    () => {
      const material = new THREE.MeshStandardMaterial({
        map: rampTexture ?? null,
        color: rampTexture ? 0xffffff : 0x8a929e,
        roughness: 0.9,
        metalness: 0.05
      });
      applyVertexJitter(material, "arenaMetal");
      return material;
    }
  );

  for (const spec of specs) {
    const key = `stadium-ramp-box-${spec.halfExtents.x.toFixed(3)}-${spec.halfExtents.y.toFixed(3)}-${spec.halfExtents.z.toFixed(3)}`;
    const geometry = context.geometryRegistry.getOrCreate(
      key,
      () => new THREE.BoxGeometry(spec.halfExtents.x * 2, spec.halfExtents.y * 2, spec.halfExtents.z * 2)
    );

    const isCornerWall = spec.kind === "corner-wall";
    const mesh = new THREE.Mesh(geometry, isCornerWall ? cornerGlassMaterial : rampMaterial);
    mesh.name = isCornerWall ? "CornerWallPanel" : "RampSegment";
    mesh.position.set(spec.translation.x, spec.translation.y, spec.translation.z);
    mesh.quaternion.set(spec.rotation.x, spec.rotation.y, spec.rotation.z, spec.rotation.w);
    if (isCornerWall) {
      mesh.renderOrder = SHELL_RENDER_ORDER;
    }
    group.add(mesh);
  }

  return group;
}

const FLOOR_PANEL_COLUMNS = 4;
const FLOOR_PANEL_ROWS = 6;
const FLOOR_PANEL_HEIGHT_OFFSET = 0.005;
/** WS8.B: panels within this distance of either goal line use the painted accent texture. */
const FLOOR_ACCENT_DISTANCE = 10;

/**
 * WS8.B (plan/POLISH_OVERHAUL_PLAN.md): replaces the single tiled floor
 * texture with a `FLOOR_PANEL_COLUMNS`x`FLOOR_PANEL_ROWS` grid of
 * individually textured/rotated panels for PS1-style visual interest —
 * two plain concrete variants across the field, painted accent panels
 * (player-side blue / opponent-side red) within `FLOOR_ACCENT_DISTANCE`
 * of each goal line. Falls back to the flat `FloorBase` box's own
 * material (no panels added) if no supplied textures are available,
 * matching every other texture-optional surface in this factory.
 */
function createPaneledFloor(context: ProceduralAssetContext): THREE.Group {
  const { fieldLength, fieldWidth } = context.stadiumDimensions;
  const { floorPanelSet, floorAccentPlayer, floorAccentOpponent } = context.stadiumTextures ?? {};

  const group = new THREE.Group();
  group.name = "FloorPanels";

  if (!floorPanelSet || floorPanelSet.length === 0) {
    return group;
  }

  const panelWidth = fieldWidth / FLOOR_PANEL_COLUMNS;
  const panelDepth = fieldLength / FLOOR_PANEL_ROWS;
  const panelGeometry = context.geometryRegistry.getOrCreate(
    "stadium-floor-panel-plane-v1",
    () => new THREE.PlaneGeometry(panelWidth, panelDepth)
  );

  const panelMaterials = floorPanelSet.map((texture, index) =>
    context.materialRegistry.getOrCreate(`stadium-floor-panel-plain-v1-${index}`, () => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.05 });
    })
  );
  const accentPlayerMaterial = floorAccentPlayer
    ? context.materialRegistry.getOrCreate(
        "stadium-floor-panel-accent-player-v1",
        () => new THREE.MeshStandardMaterial({ map: floorAccentPlayer, roughness: 0.9, metalness: 0.05 })
      )
    : null;
  const accentOpponentMaterial = floorAccentOpponent
    ? context.materialRegistry.getOrCreate(
        "stadium-floor-panel-accent-opponent-v1",
        () => new THREE.MeshStandardMaterial({ map: floorAccentOpponent, roughness: 0.9, metalness: 0.05 })
      )
    : null;

  for (let column = 0; column < FLOOR_PANEL_COLUMNS; column += 1) {
    for (let row = 0; row < FLOOR_PANEL_ROWS; row += 1) {
      const x = -fieldWidth / 2 + panelWidth * (column + 0.5);
      const z = -fieldLength / 2 + panelDepth * (row + 0.5);

      const distanceToPlayerGoal = z - -fieldLength / 2;
      const distanceToOpponentGoal = fieldLength / 2 - z;

      let material = panelMaterials[context.random.integer(0, panelMaterials.length)]!;
      if (accentPlayerMaterial && distanceToPlayerGoal < FLOOR_ACCENT_DISTANCE) {
        material = accentPlayerMaterial;
      } else if (accentOpponentMaterial && distanceToOpponentGoal < FLOOR_ACCENT_DISTANCE) {
        material = accentOpponentMaterial;
      }

      const panel = new THREE.Mesh(panelGeometry, material);
      panel.name = "FloorPanel";
      panel.rotation.x = -Math.PI / 2;
      // Free per-panel visual variety: spin the plane about its own
      // normal (a local-Z rotation, applied via `rotateZ` rather than
      // setting the Euler `.rotation.z` component directly, since the
      // latter would compose with the flattening X-rotation above in
      // world space instead of spinning in the panel's own surface
      // plane) instead of cloning/rotating the texture.
      panel.rotateZ((Math.PI / 2) * context.random.integer(0, 4));
      panel.position.set(x, FLOOR_PANEL_HEIGHT_OFFSET, z);
      group.add(panel);
    }
  }

  return group;
}

// WS8.A (plan/POLISH_OVERHAUL_PLAN.md): raised from 0.011 and paired with
// polygon-offset below — the small original gap still z-fought against
// the floor at grazing camera angles.
const MARKING_HEIGHT_OFFSET = 0.02;
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
    () =>
      new THREE.MeshBasicMaterial({
        color: VISUAL_PALETTE.paleMetal,
        transparent: true,
        opacity: 0.55,
        // WS8.A: belt-and-braces alongside the raised MARKING_HEIGHT_OFFSET.
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      })
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

// R2 (plan/RAMPS_AND_FEATURES_PLAN.md): skinnier, more spaced out, and
// visibly lit (was near-black and read as solid/heavy) — spacing 4->6,
// width 0.4->0.22, depth 0.5->0.4, plus an emissive tint.
const RIB_SPACING = 6;
const RIB_WIDTH = 0.22;
const RIB_DEPTH = 0.4;

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
    "stadium-rib-v2",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x39414f,
        emissive: new THREE.Color(0x18222e),
        emissiveIntensity: 0.6,
        roughness: 0.6,
        metalness: 0.4
      })
  );
  applyVertexJitter(ribMaterial, "arenaMetal");

  const ribGeometry = context.geometryRegistry.getOrCreate(
    "stadium-rib-v2",
    () => new THREE.BoxGeometry(RIB_WIDTH, interiorHeight, RIB_DEPTH)
  );

  // R1 (plan/RAMPS_AND_FEATURES_PLAN.md): ribs are confined to the clear
  // run between the two corner cuts so none floats inside a corner arc.
  const ribRunLength = fieldLength - 2 * CORNER_RADIUS;
  const ribCount = Math.max(2, Math.floor(ribRunLength / RIB_SPACING));
  const instanced = new THREE.InstancedMesh(ribGeometry, ribMaterial, ribCount * 2);
  instanced.name = "SideWallRibs";

  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let i = 0; i < ribCount; i += 1) {
    const z = -ribRunLength / 2 + (i + 0.5) * (ribRunLength / ribCount);

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

  // R1 (plan/RAMPS_AND_FEATURES_PLAN.md): shortened from (fieldWidth -
  // goalWidth) / 2 (which touched the side walls at full width) to stop
  // short of the curved corner panels instead — same reasoning as the
  // side-wall shortening above.
  const sideSegmentWidth = fieldWidth / 2 - CORNER_RADIUS - goalWidth / 2;
  const zPosition = (zSign * (fieldLength + WALL_THICKNESS)) / 2;

  const sideGeometry = context.geometryRegistry.getOrCreate(
    "stadium-end-wall-side-v2",
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
