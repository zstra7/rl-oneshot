import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PHYSICS_METADATA, DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { COL_STEP, LINE_WIDTH, TEXTURE_SIZE } from "@/assets/procedural/HexPatternTexture";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createStadiumBlockout, HEX_TILE_WORLD_SIZE } from "@/assets/procedural/StadiumGeometryFactory";

/**
 * R2 (plan/RAMPS_AND_FEATURES_PLAN.md): the hex glass shell was too dark
 * to read and the wall ribs were near-black solid slabs — both now carry
 * an emissive component so they're visible without losing the "faint,
 * transparent" glass shell look.
 */
function buildStadium() {
  const context = {
    three: THREE,
    geometryRegistry: new GeometryRegistry(),
    materialRegistry: new MaterialRegistry(),
    random: new SeededRandom(1),
    visualPreset: "clean" as const,
    stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
    physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
  };
  return createStadiumBlockout(context);
}

describe("R2: hex shell glass material is emissive and visibly faint", () => {
  it("side wall glass material has an emissive hex map and moderate opacity", () => {
    const stadium = buildStadium();
    const sideWall = stadium.getObjectByName("SideWallLeft") as THREE.Mesh;
    expect(sideWall).toBeTruthy();

    const material = sideWall.material as THREE.MeshStandardMaterial;
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeGreaterThanOrEqual(0.2);
    expect(material.opacity).toBeLessThanOrEqual(0.4);
    expect(material.emissiveIntensity).toBeGreaterThanOrEqual(0.6);
    expect(material.emissiveMap).toBeTruthy();
    expect(material.emissiveMap).toBe(material.map);
    expect(material.emissive.getHex()).not.toBe(0x000000);
  });

  it("the ceiling and end walls share the same emissive glass material as the side walls", () => {
    const stadium = buildStadium();
    const sideWall = stadium.getObjectByName("SideWallLeft") as THREE.Mesh;
    const ceiling = stadium.getObjectByName("Ceiling") as THREE.Mesh;
    expect(ceiling.material).toBe(sideWall.material);
  });

  // F3 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): the shared texture's
  // `repeat` no longer carries the per-surface density — that now lives in
  // each plane's own rescaled UVs (`HEX_TILE_WORLD_SIZE`), so `repeat` sits
  // at identity on every surface regardless of its dimensions.
  it("glass texture repeat is identity — density comes from per-geometry UVs, not a shared repeat", () => {
    const stadium = buildStadium();
    const sideWall = stadium.getObjectByName("SideWallLeft") as THREE.Mesh;
    const material = sideWall.material as THREE.MeshStandardMaterial;
    const map = material.map as THREE.Texture;
    expect(map.repeat.x).toBe(1);
    expect(map.repeat.y).toBe(1);
  });
});

/**
 * F3 (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md): every glass-shell surface
 * used to be a 1m-thick, double-sided BoxGeometry — a transparent
 * double-sided box renders its hex pattern on BOTH parallel faces, so every
 * wall/roof showed two hex layers ~1m apart. Converting to single-sided
 * planes positioned on the collider's inner face (material stays
 * `DoubleSide` so the single plane still reads from both camera sides)
 * removes the second layer entirely.
 */
describe("F3: single-layer glass shell — planes, not boxes", () => {
  function collectGlassMeshes(stadium: THREE.Object3D, glassMaterial: THREE.Material): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    stadium.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material === glassMaterial) {
        meshes.push(object);
      }
    });
    return meshes;
  }

  it("every glass-shell mesh (side walls, ceiling, end walls, goal boxes, corner panels) is a PlaneGeometry, not a BoxGeometry", () => {
    const stadium = buildStadium();
    const sideWall = stadium.getObjectByName("SideWallLeft") as THREE.Mesh;
    const glassMaterial = sideWall.material as THREE.Material;

    const meshes = collectGlassMeshes(stadium, glassMaterial);

    // Sanity: this should cover side walls (2), ceiling (1), end walls
    // (2 side segments + a lintel each, x2 end walls), goal boxes (back +
    // 2 sides + roof, x2 goal boxes) and the 24 corner wall panels.
    expect(meshes.length).toBeGreaterThanOrEqual(30);

    for (const mesh of meshes) {
      expect(mesh.geometry.type).toBe("PlaneGeometry");
    }

    // Names called out explicitly by the plan.
    expect((stadium.getObjectByName("SideWallLeft") as THREE.Mesh).geometry.type).toBe("PlaneGeometry");
    expect((stadium.getObjectByName("SideWallRight") as THREE.Mesh).geometry.type).toBe("PlaneGeometry");
    expect((stadium.getObjectByName("Ceiling") as THREE.Mesh).geometry.type).toBe("PlaneGeometry");

    let cornerPanelCount = 0;
    stadium.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === "CornerWallPanel") {
        expect(object.geometry.type).toBe("PlaneGeometry");
        cornerPanelCount += 1;
      }
    });
    expect(cornerPanelCount).toBe(24);
  });

  it("square-hex invariant: every glass-shell plane's UV scale matches HEX_TILE_WORLD_SIZE on both axes, within 1%", () => {
    const stadium = buildStadium();
    const sideWall = stadium.getObjectByName("SideWallLeft") as THREE.Mesh;
    const glassMaterial = sideWall.material as THREE.Material;
    const meshes = collectGlassMeshes(stadium, glassMaterial);
    expect(meshes.length).toBeGreaterThan(0);

    for (const mesh of meshes) {
      const geometry = mesh.geometry as THREE.PlaneGeometry;
      const { width: worldW, height: worldH } = geometry.parameters;

      const uv = geometry.attributes.uv!;
      let minU = Infinity;
      let maxU = -Infinity;
      let minV = Infinity;
      let maxV = -Infinity;
      for (let i = 0; i < uv.count; i += 1) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
      const uvSpanU = maxU - minU;
      const uvSpanV = maxV - minV;

      // Square cells: the two axes' world-per-UV ratios must agree with
      // each other, and both must equal HEX_TILE_WORLD_SIZE — i.e. the
      // same real-world hex density on every surface, corners included
      // (pre-F3 corner panels were ~12:1 stretched relative to the walls).
      const ratioU = worldW / uvSpanU;
      const ratioV = worldH / uvSpanV;
      expect(ratioU / ratioV).toBeCloseTo(1, 1);
      expect(Math.abs(ratioU - HEX_TILE_WORLD_SIZE) / HEX_TILE_WORLD_SIZE).toBeLessThan(0.01);
      expect(Math.abs(ratioV - HEX_TILE_WORLD_SIZE) / HEX_TILE_WORLD_SIZE).toBeLessThan(0.01);
    }
  });
});

describe("F3: hex texture constants — legible lines, seamless tiling", () => {
  it("LINE_WIDTH is at least 4 px (was 2.5)", () => {
    expect(LINE_WIDTH).toBeGreaterThanOrEqual(4);
  });

  it("the tile is exactly periodic: TEXTURE_SIZE is an integer multiple of 2*COL_STEP", () => {
    expect(TEXTURE_SIZE % (2 * COL_STEP)).toBe(0);
  });
});

describe("R2: structural ribs are skinnier, more spaced, and visibly lit", () => {
  it("rib geometry is narrower than before and the material is not near-black", () => {
    const stadium = buildStadium();
    const ribs = stadium.getObjectByName("SideWallRibs") as THREE.InstancedMesh;
    expect(ribs).toBeTruthy();

    const geometry = ribs.geometry as THREE.BoxGeometry;
    expect(geometry.parameters.width).toBeCloseTo(0.22, 5);
    expect(geometry.parameters.depth).toBeCloseTo(0.4, 5);

    const material = ribs.material as THREE.MeshStandardMaterial;
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    expect(material.emissive.getHex()).not.toBe(0x000000);
    // Not pure black nor pure white — a mid-tone that reads as visible
    // metal (three.js stores `.color` in linear space when colour
    // management is on, so this threshold is well below the naive sRGB
    // sum but comfortably above a near-black material like the old
    // 0x0c0e15, whose linear sum is roughly an order of magnitude smaller).
    const color = material.color;
    expect(color.r + color.g + color.b).toBeGreaterThan(0.1);
  });

  it("rib count reflects the wider spacing, confined to the straight run between corners", () => {
    const stadium = buildStadium();
    const ribs = stadium.getObjectByName("SideWallRibs") as THREE.InstancedMesh;
    // fieldLength 60, CORNER_RADIUS 6 -> run 48, spacing 6 -> 8 per side (16 total).
    expect(ribs.count).toBe(16);
  });
});
