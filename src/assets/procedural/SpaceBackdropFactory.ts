import * as THREE from "three";

import type { ProceduralAssetContext } from "@/assets/procedural/ProceduralAssetContext";

/**
 * G1/G2 (plan/GAME_ENHANCEMENTS_PLAN.md): a low-poly moon + a static
 * asteroid field for the space backdrop, alongside the existing starfield
 * (`StarfieldFactory.ts`). Performance budget: at most one extra mesh (the
 * moon) and one extra `InstancedMesh` (the asteroids) — two draw calls
 * total, no per-frame work, no textures above 1024x512. Both factories must
 * be constructible in Node with no DOM (this module runs under Vitest's
 * DOM-less environment) — the moon's texture is always injected from
 * outside (loaded by `AssetPipeline`, which owns async texture loading),
 * never touched here.
 */

const MOON_RADIUS = 26;
const MOON_POSITION: THREE.Vector3Tuple = [120, 95, -210];
const MOON_FALLBACK_COLOR = 0xb8bcc8;

/**
 * A single unlit sphere standing in for the moon — `MeshBasicMaterial` so it
 * costs nothing in lighting, reading crisply against the PSX void either
 * way. Geometry is registry-cached like every other procedural mesh.
 */
export function createMoon(context: ProceduralAssetContext, texture: THREE.Texture | null): THREE.Mesh {
  const geometry = context.geometryRegistry.getOrCreate("space-moon-v1", () => new THREE.SphereGeometry(MOON_RADIUS, 20, 14));

  const materialKey = `space-moon-material-v1-${texture ? "textured" : "flat"}`;
  const material = context.materialRegistry.getOrCreate(materialKey, () => {
    if (texture) {
      texture.magFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    return new THREE.MeshBasicMaterial({
      map: texture ?? null,
      color: texture ? 0xffffff : MOON_FALLBACK_COLOR
    });
  });

  const moon = new THREE.Mesh(geometry, material);
  moon.name = "Moon";
  moon.position.set(...MOON_POSITION);
  return moon;
}

const ASTEROID_TEMPLATE_DETAIL = 0; // IcosahedronGeometry(1, 0): 12 verts, 20 faces
const ASTEROID_COUNT = 14;
const ASTEROID_MIN_RADIUS = 150;
const ASTEROID_MAX_RADIUS = 300;
const ASTEROID_MIN_SCALE = 2;
const ASTEROID_MAX_SCALE = 7;
const ASTEROID_SCALE_VARIANCE = 0.3;
/** Keeps every asteroid clear of the horizon line (never behind the arena floor). */
const ASTEROID_MIN_ABS_Y_FRACTION = 0.15;

/**
 * A lumpy rock template (icosahedron, vertices radially displaced once at
 * build time — deterministic, drawn from `context.random`) instanced across
 * the sky. Static matrices, written once: no per-frame per-asteroid work.
 */
export function createAsteroidField(context: ProceduralAssetContext): THREE.InstancedMesh {
  const geometry = context.geometryRegistry.getOrCreate("space-asteroid-v1", () => {
    const base = new THREE.IcosahedronGeometry(1, ASTEROID_TEMPLATE_DETAIL);
    const position = base.attributes["position"] as THREE.BufferAttribute;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i);
      const displacement = context.random.range(0.72, 1.28);
      vertex.multiplyScalar(displacement);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    base.computeVertexNormals();
    return base;
  });

  const material = context.materialRegistry.getOrCreate(
    "space-asteroid-material-v1",
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x6a7080,
        flatShading: true,
        roughness: 0.95,
        metalness: 0.05
      })
  );

  const instanced = new THREE.InstancedMesh(geometry, material, ASTEROID_COUNT);
  instanced.name = "AsteroidField";

  const matrix = new THREE.Matrix4();
  const translation = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < ASTEROID_COUNT; i += 1) {
    const radius = context.random.range(ASTEROID_MIN_RADIUS, ASTEROID_MAX_RADIUS);
    const theta = context.random.range(0, Math.PI * 2);
    // Full-sphere direction, then clamp the vertical component away from
    // the horizon so no asteroid sits behind the arena floor line.
    let phi = Math.acos(context.random.range(-1, 1));
    const minPhiFromPole = Math.asin(ASTEROID_MIN_ABS_Y_FRACTION);
    if (phi > Math.PI / 2 - minPhiFromPole && phi < Math.PI / 2 + minPhiFromPole) {
      phi = phi <= Math.PI / 2 ? Math.PI / 2 - minPhiFromPole : Math.PI / 2 + minPhiFromPole;
    }

    translation.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );

    rotation.setFromEuler(
      new THREE.Euler(
        context.random.range(0, Math.PI * 2),
        context.random.range(0, Math.PI * 2),
        context.random.range(0, Math.PI * 2)
      )
    );

    const baseScale = context.random.range(ASTEROID_MIN_SCALE, ASTEROID_MAX_SCALE);
    scale.set(
      baseScale * context.random.range(1 - ASTEROID_SCALE_VARIANCE, 1 + ASTEROID_SCALE_VARIANCE),
      baseScale * context.random.range(1 - ASTEROID_SCALE_VARIANCE, 1 + ASTEROID_SCALE_VARIANCE),
      baseScale * context.random.range(1 - ASTEROID_SCALE_VARIANCE, 1 + ASTEROID_SCALE_VARIANCE)
    );

    matrix.compose(translation, rotation, scale);
    instanced.setMatrixAt(i, matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;

  return instanced;
}
