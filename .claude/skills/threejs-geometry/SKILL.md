---
name: threejs-geometry
description: Procedural BufferGeometry construction, instancing, and geometry reuse patterns for stadium, ball, boost pad, and VFX meshes.
---

# Three.js Geometry (r160)

## Procedural geometry

- Build custom shapes with `THREE.BufferGeometry` directly (`setAttribute("position", ...)`, `setIndex(...)`) or compose primitives (`BoxGeometry`, `CylinderGeometry`, `IcosahedronGeometry`, `LatheGeometry`, `ExtrudeGeometry`) and `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js` for static combined meshes (structural ribs, floor panels).
- Deterministic procedural content (stadium blockout, starfield placement, pad rings) must be generated from a seeded PRNG (see `src/assets/deterministicRandom.ts`), never `Math.random()`.
- Always call `geometry.computeBoundingSphere()` / `computeBoundingBox()` after manual attribute writes so frustum culling and raycasting work.

## Instancing

Use `THREE.InstancedMesh` for repeated stadium elements (ribs, glass panels, boost pad rings, star sprites, light bollards):

```ts
const instanced = new THREE.InstancedMesh(sharedGeometry, sharedMaterial, count);
instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage); // DynamicDrawUsage only if updated post-creation
```

For per-instance color variation, use `instanced.instanceColor` (r160 supports this natively) rather than duplicating materials.

## Reuse

- One shared `BufferGeometry` per logical shape (ball, pad, rib segment). Clone `Object3D`/`Mesh` wrappers, never clone geometry data unless deliberately editing per-instance vertices.
- Never construct new geometry inside a per-frame update. Particle/VFX systems must pre-allocate a pool of `InstancedMesh` or `Points` buffers sized to the maximum concurrent effect count and write into existing typed arrays (`geometry.attributes.position.array[...] = x; attribute.needsUpdate = true`).

## Physics vs. visual dimensions

Geometry dimensions are always derived from the authoritative physics/stadium definition (radius, half-extents), never the reverse. Do not size Rapier colliders from a mesh's computed bounding box.
