---
name: threejs-materials
description: Material selection, sharing, and the PSX material-role registry for Space Carball's low-fidelity look.
---

# Three.js Materials (r160)

## Selection

- Prefer `THREE.MeshStandardMaterial` / `MeshPhysicalMaterial` for lit gameplay surfaces (car, stadium, ball) so the PSX post pass has real lighting to quantize.
- Use `MeshBasicMaterial` for unlit/emissive-only elements (starfield points, glow sprites, HUD-adjacent world-space markers).
- Use `ShaderMaterial`/`RawShaderMaterial` only for effects that standard materials cannot express (vertex jitter, dither, palette quantization) — see `threejs-shaders`.

## Material role registry

Maintain one central material factory/registry (`src/assets/materialRegistry.ts`) mapping semantic roles (`"stadium-floor"`, `"stadium-glass"`, `"car-body-team-a"`, `"boost-pad-idle"`, `"boost-pad-active"`, `"ball"`) to shared `Material` instances. Consumers request by role; they never call `new THREE.MeshStandardMaterial()` ad hoc.

## Reuse and cloning

- Materials are shared by default. Only `.clone()` a material when an instance needs a genuinely independent uniform (e.g. per-team color tint) — and register the clone in the same registry so disposal is tracked.
- Two car instances (player/opponent) must not download or parse the GLB twice; clone the `Object3D` hierarchy via `SkeletonUtils.clone()` (for skinned meshes) or a manual deep clone, and swap only the material's color/emissive for team identity.

## Transparency

- Glass/canopy stadium layers use `transparent: true` with `depthWrite: false` and explicit `renderOrder` to avoid sorting artifacts — test with the stadium's actual camera angles, not just a default view.
- Avoid `alphaTest` + `transparent` combinations without checking r160's forward-pass behavior first; prefer `alphaTest` alone for hard-edged cutouts (pad grates) when possible.

## Disposal

`material.dispose()` releases GPU program state but not its textures — dispose owned textures separately, and never dispose a shared registry material while any live mesh still references it.
