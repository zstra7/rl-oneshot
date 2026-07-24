import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PLACEHOLDER_PHYSICS_METADATA, DEFAULT_STADIUM_DIMENSIONS } from "@/assets/AssetTypes";
import { GeometryRegistry } from "@/assets/procedural/GeometryRegistry";
import { MaterialRegistry } from "@/assets/procedural/MaterialRegistry";
import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";
import { SeededRandom } from "@/assets/procedural/SeededRandom";
import { createAsteroidField, createMoon } from "@/assets/procedural/SpaceBackdropFactory";

function makeContext(seed = 1): ProceduralAssetContext {
  return {
    three: THREE,
    geometryRegistry: new GeometryRegistry(),
    materialRegistry: new MaterialRegistry(),
    random: new SeededRandom(seed),
    visualPreset: "clean",
    stadiumDimensions: DEFAULT_STADIUM_DIMENSIONS,
    physicsMetadata: PLACEHOLDER_PHYSICS_METADATA
  };
}

describe("G1 createMoon", () => {
  it("builds a low-poly unlit sphere named Moon without a DOM, with or without a texture", () => {
    const context = makeContext();
    expect(() => createMoon(context, null)).not.toThrow();
    const moon = createMoon(context, null);
    expect(moon.name).toBe("Moon");
    expect(moon.material).toBeInstanceOf(THREE.MeshBasicMaterial);

    const geometry = moon.geometry as THREE.SphereGeometry;
    const vertexCount = geometry.attributes["position"]!.count;
    expect(vertexCount).toBeLessThanOrEqual(500);
  });

  it("sits inside the camera's far plane (500) but well beyond the starfield's near layer", () => {
    const moon = createMoon(makeContext(), null);
    const distance = moon.position.length();
    expect(distance).toBeLessThan(500);
    expect(distance).toBeGreaterThan(140);
  });

  it("geometry is registry-cached across calls", () => {
    const context = makeContext();
    const a = createMoon(context, null);
    const b = createMoon(context, null);
    expect(a.geometry).toBe(b.geometry);
  });

  it("accepts an injected texture and configures it for the PSX look", () => {
    const context = makeContext();
    const texture = new THREE.Texture();
    const moon = createMoon(context, texture);
    const material = moon.material as THREE.MeshBasicMaterial;
    expect(material.map).toBe(texture);
    expect(texture.magFilter).toBe(THREE.NearestFilter);
  });
});

describe("G2 createAsteroidField", () => {
  it("returns an InstancedMesh with a low-poly template and a bounded instance count", () => {
    const context = makeContext();
    const field = createAsteroidField(context);
    expect(field).toBeInstanceOf(THREE.InstancedMesh);
    expect(field.name).toBe("AsteroidField");
    expect(field.count).toBeGreaterThanOrEqual(10);
    expect(field.count).toBeLessThanOrEqual(20);

    // IcosahedronGeometry(1, 0) is non-indexed (three.js duplicates vertices
    // per face: 20 triangular faces * 3 = 60) — still a genuinely low-poly
    // template (20 triangles total), just not indexed-vertex-count low.
    const vertexCount = field.geometry.attributes["position"]!.count;
    expect(vertexCount).toBeLessThanOrEqual(64);
  });

  it("is deterministic: two fields built from contexts with the same seed produce identical instance matrices", () => {
    const fieldA = createAsteroidField(makeContext(7));
    const fieldB = createAsteroidField(makeContext(7));
    expect(Array.from(fieldA.instanceMatrix.array)).toEqual(Array.from(fieldB.instanceMatrix.array));
  });

  it("every instance sits within the intended shell and clear of the horizon line", () => {
    const field = createAsteroidField(makeContext(3));
    const matrix = new THREE.Matrix4();
    const translation = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < field.count; i += 1) {
      field.getMatrixAt(i, matrix);
      matrix.decompose(translation, rotation, scale);
      const distance = translation.length();
      expect(distance).toBeGreaterThanOrEqual(140);
      expect(distance).toBeLessThanOrEqual(320);
      expect(Math.abs(translation.y)).toBeGreaterThanOrEqual(0.15 * distance * 0.9);
    }
  });
});
