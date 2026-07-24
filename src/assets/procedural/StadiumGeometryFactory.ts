import * as THREE from "three";

import { createHexShellTexture } from "@/assets/procedural/HexPatternTexture";
import type { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import {
  CORNER_PANEL_HALF_THICK,
  CORNER_PANELS,
  CORNER_RADIUS,
  RAMP_FILLET_RADIUS,
  generateArenaRamps
} from "@/physics/arena/ArenaRampGeometry";
import { TEST_ARENA_DIMENSIONS } from "@/physics/arena/TestArenaPresets";
import { GOAL_HALF_WIDTH } from "@/physics/goal/GoalTypes";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";
import { applyVertexJitter } from "@/visual-language/VertexJitter";

const WALL_THICKNESS = 1;
/** Meshes drawn after all opaque geometry, so the transparent shell never fights the floor/ribs for depth order. */
const SHELL_RENDER_ORDER = 10;

/**
 * F3 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): world units per full hex
 * texture tile. The hex texture's primary-pass geometry occupies a
 * `2*HEX_CIRCUMRADIUS` px span of the 512 px tile, so at this world size a
 * single hex reads as roughly 1.92 m across — "square, ~2x the old size"
 * per the plan's brief. Every glass-shell plane below sizes its UVs off
 * this single constant (instead of a per-material `texture.repeat`), so
 * hex cells read as consistent, square, correctly-scaled world size on
 * every surface — including the corner panels, which used to be
 * ~12:1 stretched because they shared the side walls' `repeat.set(10, 10)`
 * regardless of their own (much smaller) dimensions.
 */
export const HEX_TILE_WORLD_SIZE = 11.5;

/**
 * F3: builds (and registry-caches) a single-sided plane sized in world
 * units, with UVs rescaled so `HEX_TILE_WORLD_SIZE` world units span
 * exactly one full hex-texture tile on both axes — this is what keeps hex
 * cells square and consistently sized regardless of the plane's aspect
 * ratio, replacing the old shared `hexTexture.repeat.set(10, 10)` that
 * stretched differently per surface.
 */
/**
 * G3 (plan/GAME_ENHANCEMENTS_PLAN.md): `uOffsetWorld` (world units, same
 * scale as `worldW`/`worldH`) shifts every U coordinate before the
 * `HEX_TILE_WORLD_SIZE` rescale — this is what lets a sequence of adjacent
 * panels (the curved corners, below) continue the SAME hex pattern across
 * their shared edges instead of each restarting the tile at u=0. Every
 * other caller passes 0 (the default), so their behaviour is unchanged.
 */
function createShellPlaneGeometry(
  registry: GeometryRegistry,
  key: string,
  worldW: number,
  worldH: number,
  uOffsetWorld = 0
): THREE.BufferGeometry {
  return registry.getOrCreate(key, () => {
    const g = new THREE.PlaneGeometry(worldW, worldH);
    const uv = g.attributes.uv!;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(
        i,
        (uv.getX(i) * worldW + uOffsetWorld) / HEX_TILE_WORLD_SIZE,
        uv.getY(i) * (worldH / HEX_TILE_WORLD_SIZE)
      );
    }
    return g;
  });
}

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
  // G4 (plan/GAME_ENHANCEMENTS_PLAN.md): warmed from a near-black blue-gray
  // (0x11131a) toward the palette's warmConcrete — the floor's base reads
  // between/under the textured panels, and the old near-black made the
  // whole arena floor feel colder and flatter than intended.
  const floorMaterial = context.materialRegistry.getOrCreate("stadium-floor-base-v4", () => {
    const material = new THREE.MeshStandardMaterial({
      color: VISUAL_PALETTE.warmConcrete,
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
  // F3 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): every glass surface is
  // now a single-sided plane (was a double-sided box, which rendered the
  // hex pattern on both parallel faces — a visible double layer) whose
  // geometry carries its own per-surface UV scale, so `repeat` drops back
  // to identity (1,1) — density now comes from `createShellPlaneGeometry`,
  // not a single shared repeat value that stretched differently on every
  // surface. `DoubleSide` stays on the material (not the geometry) purely
  // so the single plane still renders correctly from both interior and
  // exterior camera angles.
  // G4: with a warmer floor and a violet-lifted sky now carrying some of
  // the scene's depth, the shell no longer needs to carry the whole look
  // on its own — dialed the glow/opacity back slightly so it still reads
  // clearly as the cyan structural identity without overpowering the
  // warmer palette around it.
  const glassMaterial = context.materialRegistry.getOrCreate("stadium-glass-shell-v4", () => {
    const hexTexture = createHexShellTexture();
    hexTexture.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      map: hexTexture,
      emissive: new THREE.Color(0x66d4ff),
      emissiveMap: hexTexture,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.24,
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
  // F3: single-sided plane sitting exactly on the physics collider's inner
  // (field-facing) face (`x = ∓fieldWidth/2`) instead of a 1m-thick box
  // centred half a metre further out — the box rendered its hex pattern on
  // both parallel faces, which was the "double hex layer" bug.
  const sideWallLength = fieldLength - 2 * CORNER_RADIUS;
  const leftWallGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-side-wall-plane-left-v3",
    sideWallLength,
    interiorHeight
  );
  const rightWallGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-side-wall-plane-right-v3",
    sideWallLength,
    interiorHeight
  );

  const leftWall = new THREE.Mesh(leftWallGeometry, glassMaterial);
  leftWall.name = "SideWallLeft";
  leftWall.position.set(-fieldWidth / 2, interiorHeight / 2, 0);
  // Rotate the plane (default normal +Z, width along local X) so its width
  // axis runs along world Z and its normal faces +X, into the field.
  leftWall.rotation.y = Math.PI / 2;
  leftWall.renderOrder = SHELL_RENDER_ORDER;
  root.add(leftWall);

  const rightWall = new THREE.Mesh(rightWallGeometry, glassMaterial);
  rightWall.name = "SideWallRight";
  rightWall.position.set(fieldWidth / 2, interiorHeight / 2, 0);
  // Normal faces -X, into the field, from the opposite wall.
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.renderOrder = SHELL_RENDER_ORDER;
  root.add(rightWall);

  // F3: plane at the underside (interior) face of the ceiling, `y =
  // interiorHeight`, not the old box's centre half a metre higher.
  const ceilingGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-ceiling-plane-v3",
    fieldWidth,
    fieldLength
  );
  const ceiling = new THREE.Mesh(ceilingGeometry, glassMaterial);
  ceiling.name = "Ceiling";
  ceiling.position.set(0, interiorHeight, 0);
  // Lay flat, facing down into the arena (matches the floor panels'
  // `rotation.x = -Math.PI / 2` convention used elsewhere in this file).
  ceiling.rotation.x = -Math.PI / 2;
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
/** G7.b: world units per full texture tile on a ramp box — matches the floor panels' own tiling density. */
const RAMP_TEX_WORLD_SIZE = 4;

/**
 * G7.b (plan/GAME_ENHANCEMENTS_PLAN.md): `BoxGeometry`'s default UVs run
 * 0..1 per face regardless of that face's actual size, so a shared ramp box
 * geometry (reused across many differently-shaped ramp segments) stretched
 * the floor texture differently on every segment. Rescales each of the 6
 * faces' UVs by that face's own world dimensions (three.js's BoxGeometry
 * face order/orientation: +x/-x span (depth,height), +y/-y span
 * (width,depth), +z/-z span (width,height) — 4 vertices per face, 24
 * total), so the texture reads at a consistent world-space tile size on
 * every ramp segment, however large or small.
 */
function scaleBoxUvs(geometry: THREE.BoxGeometry, width: number, height: number, depth: number, worldPerTile: number): THREE.BoxGeometry {
  const uv = geometry.attributes["uv"]!;
  const faceSpans: ReadonlyArray<readonly [number, number]> = [
    [depth, height], // +x
    [depth, height], // -x
    [width, depth], // +y
    [width, depth], // -y
    [width, height], // +z
    [width, height] // -z
  ];
  for (let face = 0; face < faceSpans.length; face += 1) {
    const [faceW, faceH] = faceSpans[face]!;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const i = face * 4 + vertex;
      uv.setXY(i, uv.getX(i) * (faceW / worldPerTile), uv.getY(i) * (faceH / worldPerTile));
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

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
  if (rampTexture) {
    // G7.b: defensive — createPaneledFloor also sets this on the same
    // shared texture object, but a repeat-wrapped ramp texture must never
    // depend on that unrelated call having already run first.
    rampTexture.wrapS = THREE.RepeatWrapping;
    rampTexture.wrapT = THREE.RepeatWrapping;
  }
  // G4: flat fallback color warmed to match the palette shift in the floor
  // base (0x8a929e -> 0x7d776e) — only visible when no floor texture loaded.
  const rampMaterial = context.materialRegistry.getOrCreate(
    `stadium-ramp-v2-${rampTexture ? "textured" : "flat"}`,
    () => {
      const material = new THREE.MeshStandardMaterial({
        map: rampTexture ?? null,
        color: rampTexture ? 0xffffff : 0x7d776e,
        roughness: 0.9,
        metalness: 0.05
      });
      applyVertexJitter(material, "arenaMetal");
      return material;
    }
  );

  // G3 (plan/GAME_ENHANCEMENTS_PLAN.md): every corner's 6 panels arrive in
  // this array in ascending arc order (see `generateCorner`'s `for (let i =
  // 0; i < CORNER_PANELS...)` loop), interleaved with floor-fillet specs but
  // never reordered relative to each other — so counting corner-wall specs
  // as they're encountered and taking the count modulo CORNER_PANELS
  // recovers each panel's position (0..5) within its own corner, without
  // needing the physics-shared RampSegmentSpec type to carry an index.
  let cornerWallOrdinal = 0;

  for (const spec of specs) {
    if (spec.kind === "corner-wall") {
      // F3: single-sided plane sized off the collider's own half-extents,
      // instead of a 1m-thick box that rendered the hex pattern on both
      // parallel faces.
      // G3: every panel is the same size (chordHalf/height are constants
      // independent of which corner/index), so the same 6 geometries (one
      // per arc position) are shared across all 4 corners — each carries a
      // U offset of `index * panelWidth` so the hex pattern CONTINUES across
      // panel boundaries within a corner instead of restarting at u=0 on
      // every panel (the reported "clipped" hexes).
      const panelIndex = cornerWallOrdinal % CORNER_PANELS;
      cornerWallOrdinal += 1;
      const panelWidth = spec.halfExtents.x * 2;
      const key = `stadium-corner-panel-plane-v4-${panelIndex}-${spec.halfExtents.x.toFixed(3)}-${spec.halfExtents.y.toFixed(3)}`;
      const geometry = createShellPlaneGeometry(
        context.geometryRegistry,
        key,
        panelWidth,
        spec.halfExtents.y * 2,
        panelIndex * panelWidth
      );

      const mesh = new THREE.Mesh(geometry, cornerGlassMaterial);
      mesh.name = "CornerWallPanel";
      mesh.quaternion.set(spec.rotation.x, spec.rotation.y, spec.rotation.z, spec.rotation.w);

      // `spec.rotation` is `yawToDirection(outward)` (ArenaRampGeometry.ts's
      // `generateCorner`), which maps the panel's local +Z axis to the
      // OUTWARD normal — so the collider's inner (field-facing) face is
      // `CORNER_PANEL_HALF_THICK` in the local -Z direction from
      // `spec.translation` (the box's CENTRE). Offsetting the plane there,
      // via the same rotation, keeps "what you see is what you drive on":
      // the visible surface lands exactly on the F2-fixed inner face the
      // physics collider actually presents, not the box centre.
      const innerFaceOffset = new THREE.Vector3(0, 0, -CORNER_PANEL_HALF_THICK).applyQuaternion(mesh.quaternion);
      mesh.position.set(
        spec.translation.x + innerFaceOffset.x,
        spec.translation.y + innerFaceOffset.y,
        spec.translation.z + innerFaceOffset.z
      );
      mesh.renderOrder = SHELL_RENDER_ORDER;
      group.add(mesh);
      continue;
    }

    // G7.b: world-scaled UVs (not the box's default 0..1-per-face) so the
    // floor texture tiles at a consistent world size on every ramp segment
    // regardless of that segment's own dimensions — the previously
    // reported "stretched" ramp texture.
    const key = `stadium-ramp-box-v2-${spec.halfExtents.x.toFixed(3)}-${spec.halfExtents.y.toFixed(3)}-${spec.halfExtents.z.toFixed(3)}`;
    const geometry = context.geometryRegistry.getOrCreate(key, () => {
      const width = spec.halfExtents.x * 2;
      const boxHeight = spec.halfExtents.y * 2;
      const depth = spec.halfExtents.z * 2;
      const box = new THREE.BoxGeometry(width, boxHeight, depth);
      return scaleBoxUvs(box, width, boxHeight, depth, RAMP_TEX_WORLD_SIZE);
    });

    const mesh = new THREE.Mesh(geometry, rampMaterial);
    mesh.name = "RampSegment";
    mesh.position.set(spec.translation.x, spec.translation.y, spec.translation.z);
    mesh.quaternion.set(spec.rotation.x, spec.rotation.y, spec.rotation.z, spec.rotation.w);
    group.add(mesh);
  }

  group.add(createRampEndCaps(context));

  return group;
}

/**
 * G7.b (plan/GAME_ENHANCEMENTS_PLAN.md): the two end-wall floor->wall
 * fillet runs (one on each side of the goal mouth) stop abruptly at the
 * goal post's own inner edge — the run's segments simply end there, with
 * nothing filling the open cross-section, so a camera near the goal frame
 * sees straight through the ramp to the hollow space underneath ("cuts off
 * and you can see under the ramp"). This adds a flat, filled quarter-disc
 * plate — the fillet's own cross-sectional profile: the pie-slice region
 * bounded by the floor, the wall, and the radius-`RAMP_FILLET_RADIUS` arc
 * connecting them — at that open end, plugging the hole so the ramp reads
 * as a solid form meeting the goal frame instead of a hollow shell.
 *
 * One cap per (end, side): 2 ends x 2 sides = 4 total, each positioned at
 * the exact floor/wall corner point (`x = xSign*GOAL_HALF_WIDTH`, `y = 0`,
 * `z = zSign*halfLength`) that `filletRun`'s theta=0 segment starts from.
 */
function createRampEndCaps(context: ProceduralAssetContext): THREE.Group {
  const { halfLength } = TEST_ARENA_DIMENSIONS;
  const group = new THREE.Group();
  group.name = "RampEndCaps";

  // Shape-local (u, v) = (inset-from-wall, height). The pie slice: corner
  // at the origin, straight edge along the floor out to (R, 0), the
  // quarter-circle arc from (R, 0) up to (0, R), then straight back down
  // the wall to the origin.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(RAMP_FILLET_RADIUS, 0);
  shape.absarc(0, 0, RAMP_FILLET_RADIUS, 0, Math.PI / 2, false);
  shape.lineTo(0, 0);

  const geometry = context.geometryRegistry.getOrCreate("stadium-ramp-endcap-v1", () => {
    const shapeGeometry = new THREE.ShapeGeometry(shape);
    // ShapeGeometry's default UVs already span the shape's own local (u,v)
    // extent 0..R on each axis in "UV units", not world units — rescale by
    // RAMP_TEX_WORLD_SIZE so this small cap tiles at the same density as
    // the rest of the ramp instead of stretching one tile across it.
    const uv = shapeGeometry.attributes["uv"]!;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, (uv.getX(i) * RAMP_FILLET_RADIUS) / RAMP_TEX_WORLD_SIZE, (uv.getY(i) * RAMP_FILLET_RADIUS) / RAMP_TEX_WORLD_SIZE);
    }
    uv.needsUpdate = true;
    return shapeGeometry;
  });

  // Double-sided so the cap reads correctly from either the interior
  // (driving toward the goal) or exterior camera angle without depending
  // on getting the local-axis winding exactly right by inspection alone —
  // this is a thin visual plug, not a drivable collider.
  const capMaterial = context.materialRegistry.getOrCreate("stadium-ramp-endcap-material-v1", () => {
    const rampTexture = context.stadiumTextures?.floorPanelSet?.[0];
    const material = new THREE.MeshStandardMaterial({
      map: rampTexture ?? null,
      color: rampTexture ? 0xffffff : 0x7d776e,
      roughness: 0.9,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    applyVertexJitter(material, "arenaMetal");
    return material;
  });

  for (const zSign of [-1, 1] as const) {
    for (const xSign of [-1, 1] as const) {
      const mesh = new THREE.Mesh(geometry, capMaterial);
      mesh.name = "RampEndCap";

      // Local shape X (inset) -> world (0, 0, -zSign); local shape Y
      // (height) -> world (0, 1, 0) — matches `filletRun`'s own inward
      // direction for this end wall (`{ x: 0, y: 0, z: -zSign }`).
      const localX = new THREE.Vector3(0, 0, -zSign);
      const localY = new THREE.Vector3(0, 1, 0);
      const localZ = new THREE.Vector3().crossVectors(localX, localY);
      const basis = new THREE.Matrix4().makeBasis(localX, localY, localZ);
      mesh.quaternion.setFromRotationMatrix(basis);

      mesh.position.set(xSign * GOAL_HALF_WIDTH, 0, zSign * halfLength);
      group.add(mesh);
    }
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

      // F13 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): deterministic,
      // mirrored across both field axes instead of `context.random`
      // draws, so the alternating look is symmetrical rather than pure
      // noise. `(mc, mr)` are the distances to the nearer edge on each
      // axis, so opposite panels (which mirror each other) always land
      // on the same `(mc, mr)` pair and therefore the same material/
      // rotation.
      const mc = Math.min(column, FLOOR_PANEL_COLUMNS - 1 - column);
      const mr = Math.min(row, FLOOR_PANEL_ROWS - 1 - row);
      let material = panelMaterials[(mc * 2 + mr) % panelMaterials.length]!;
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
      panel.rotateZ((Math.PI / 2) * ((mc + mr) % 4));
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

  // G4: emissive tint warmed from a cool blue-black to the palette's
  // hazardAmberDim — the ribs now read as amber-lit structure (lit BY the
  // arena) instead of adding yet more cold void to the walls.
  const ribMaterial = context.materialRegistry.getOrCreate(
    "stadium-rib-v3",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x39414f,
        emissive: new THREE.Color(VISUAL_PALETTE.hazardAmberDim),
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
  // F3: the plane sits at the wall's inner face (`z = ±fieldLength/2`),
  // half the old box's thickness closer to the field than `zPosition`
  // (the box's centre) used to be. A default-orientation PlaneGeometry
  // already has width along local X and height along local Y with the
  // normal on Z, which matches these segments' box axes exactly (thickness
  // was along Z) — no rotation needed, unlike the side walls/ceiling.
  const innerZ = zSign * (fieldLength / 2);

  const sideGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-end-wall-side-plane-v3",
    sideSegmentWidth,
    interiorHeight
  );

  const leftSegment = new THREE.Mesh(sideGeometry, material);
  leftSegment.position.set(
    -(goalWidth / 2 + sideSegmentWidth / 2),
    interiorHeight / 2,
    innerZ
  );
  leftSegment.renderOrder = SHELL_RENDER_ORDER;
  group.add(leftSegment);

  const rightSegment = new THREE.Mesh(sideGeometry, material);
  rightSegment.position.set(
    goalWidth / 2 + sideSegmentWidth / 2,
    interiorHeight / 2,
    innerZ
  );
  rightSegment.renderOrder = SHELL_RENDER_ORDER;
  group.add(rightSegment);

  const lintelHeight = interiorHeight - goalHeight;

  if (lintelHeight > 0) {
    const lintelGeometry = createShellPlaneGeometry(
      context.geometryRegistry,
      "stadium-end-wall-lintel-plane-v3",
      goalWidth,
      lintelHeight
    );
    const lintel = new THREE.Mesh(lintelGeometry, material);
    lintel.position.set(0, goalHeight + lintelHeight / 2, innerZ);
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

  // F3: planes at each surface's physics inner face — half the old box
  // thickness closer to the goal-box interior than the box centres used
  // above (still the box-centre `zSign * (halfLength + goalDepth)`/etc.
  // formulas the physics goal-box colliders use, just offset inward by
  // `WALL_THICKNESS / 2`).
  const backWallGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-goalbox-back-plane-v3",
    goalWidth,
    goalHeight
  );
  const backWall = new THREE.Mesh(backWallGeometry, material);
  backWall.position.set(0, goalHeight / 2, zSign * (halfLength + goalDepth - WALL_THICKNESS / 2));
  backWall.renderOrder = SHELL_RENDER_ORDER;
  group.add(backWall);

  const sideWallGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-goalbox-side-plane-v3",
    goalDepth,
    goalHeight
  );
  for (const xSign of [-1, 1] as const) {
    const sideWall = new THREE.Mesh(sideWallGeometry, material);
    sideWall.position.set(xSign * (goalWidth / 2), goalHeight / 2, zSign * (halfLength + goalDepth / 2));
    // Same rotation convention as the arena's own side walls: width axis
    // (local X) onto world Z, normal facing into the goal box's interior.
    sideWall.rotation.y = xSign === 1 ? -Math.PI / 2 : Math.PI / 2;
    sideWall.renderOrder = SHELL_RENDER_ORDER;
    group.add(sideWall);
  }

  const roofGeometry = createShellPlaneGeometry(
    context.geometryRegistry,
    "stadium-goalbox-roof-plane-v3",
    goalWidth,
    goalDepth
  );
  const roof = new THREE.Mesh(roofGeometry, material);
  // Underside (interior) face: `y = goalHeight`, not the box's centre.
  roof.position.set(0, goalHeight, zSign * (halfLength + goalDepth / 2));
  roof.rotation.x = -Math.PI / 2;
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
