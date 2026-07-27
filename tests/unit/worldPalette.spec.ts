import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PHYSICS_METADATA, DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";
import { VISUAL_PALETTE } from "@/visual-language/PsxVisualPalette";

/**
 * G4 (plan/GAME_ENHANCEMENTS_PLAN.md): a curated colour pass to fix the
 * "desolate" world (floor/ribs/void all sat in one narrow blue-gray band).
 * This gate proves the pass was actually applied — floor + rib materials
 * carry the new warm palette values — and pins the team/UI identity colors
 * against accidental drift from the same change.
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

function hexOf(value: string): number {
  return new THREE.Color(value).getHex();
}

describe("G4 world palette", () => {
  it("the new warm/depth palette keys exist and parse as valid hex colors", () => {
    for (const key of ["duskViolet", "warmConcrete", "hazardAmberDim", "horizonTeal"] as const) {
      const value = VISUAL_PALETTE[key];
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("team identity colors are frozen — this pass must not touch them", () => {
    expect(VISUAL_PALETTE.playerCyan).toBe("#24E6FF");
    expect(VISUAL_PALETTE.opponentMagenta).toBe("#FF3AAE");
  });

  it("the floor base material uses the new warm palette color", () => {
    const stadium = buildStadium();
    const floor = stadium.getObjectByName("FloorBase") as THREE.Mesh;
    expect(floor).toBeTruthy();
    const material = floor.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(hexOf(VISUAL_PALETTE.warmConcrete));
  });

  it("the wall rib material uses the new warm emissive tint", () => {
    const stadium = buildStadium();
    const ribs = stadium.getObjectByName("SideWallRibs") as THREE.InstancedMesh;
    expect(ribs).toBeTruthy();
    const material = ribs.material as THREE.MeshStandardMaterial;
    expect(material.emissive.getHex()).toBe(hexOf(VISUAL_PALETTE.hazardAmberDim));
  });

  it("the glass shell reads softer than before (opacity/emissive both dialed back)", () => {
    const stadium = buildStadium();
    const sideWall = stadium.getObjectByName("SideWallLeft") as THREE.Mesh;
    const material = sideWall.material as THREE.MeshStandardMaterial;
    expect(material.opacity).toBeLessThan(0.28);
    expect(material.emissiveIntensity).toBeLessThan(0.85);
    // Still clearly present, not accidentally near-invisible.
    expect(material.opacity).toBeGreaterThan(0.15);
    expect(material.emissiveIntensity).toBeGreaterThan(0.4);
  });
});
