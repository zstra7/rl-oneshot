import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STADIUM_DIMENSIONS,
  PLACEHOLDER_PHYSICS_METADATA
} from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createDefaultStarfield } from "@/assets/procedural/StarfieldFactory";
import { createStadiumBlockout } from "@/assets/procedural/StadiumGeometryFactory";

function createFreshContext(seed: number): ProceduralAssetContext {
  return {
    three: THREE,
    geometryRegistry: new GeometryRegistry(),
    materialRegistry: new MaterialRegistry(),
    random: new SeededRandom(seed),
    visualPreset: "balanced",
    stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
    physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
  };
}

function collectPositions(root: THREE.Object3D): number[][] {
  const positions: number[][] = [];

  root.traverse((object) => {
    const mesh = object as THREE.Points;
    const attribute = mesh.geometry?.getAttribute?.("position") as
      | THREE.BufferAttribute
      | undefined;

    if (attribute) {
      positions.push(Array.from(attribute.array as Float32Array));
    }
  });

  return positions;
}

describe("procedural generation determinism (asset pipeline spec section 28)", () => {
  it("the same seed produces identical starfield vertex data", () => {
    const starfieldA = createDefaultStarfield(createFreshContext(2000));
    const starfieldB = createDefaultStarfield(createFreshContext(2000));

    expect(collectPositions(starfieldA)).toEqual(collectPositions(starfieldB));
  });

  it("a different seed produces different starfield vertex data", () => {
    const starfieldA = createDefaultStarfield(createFreshContext(2000));
    const starfieldC = createDefaultStarfield(createFreshContext(2001));

    expect(collectPositions(starfieldA)).not.toEqual(collectPositions(starfieldC));
  });

  it("stadium blockout geometry is stable across independent builds (no Math.random)", () => {
    const stadiumA = createStadiumBlockout(createFreshContext(1000));
    const stadiumB = createStadiumBlockout(createFreshContext(1000));

    const boundingBoxA = new THREE.Box3().setFromObject(stadiumA);
    const boundingBoxB = new THREE.Box3().setFromObject(stadiumB);

    expect(boundingBoxA.min.toArray()).toEqual(boundingBoxB.min.toArray());
    expect(boundingBoxA.max.toArray()).toEqual(boundingBoxB.max.toArray());
  });
});
