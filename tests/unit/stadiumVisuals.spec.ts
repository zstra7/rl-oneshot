import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PHYSICS_METADATA, DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";

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
