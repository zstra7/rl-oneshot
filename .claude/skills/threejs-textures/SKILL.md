---
name: threejs-textures
description: Loading supplied stadium textures, generating procedural CanvasTexture/DataTexture content, and color-space/filtering rules.
---

# Three.js Textures (r160)

## Supplied textures

- Load with `THREE.TextureLoader` (or route through `GLTFLoader`'s embedded loader for the car GLB). Never fetch remote texture URLs — all supplied textures live under `assets/textures/` and are bundled by Vite.
- Set `texture.colorSpace = THREE.SRGBColorSpace` for albedo/base-color maps and `THREE.NoColorSpace` (formerly `LinearEncoding`) for normal/roughness/ORM maps. Getting this wrong is the most common washed-out/oversaturated PSX texture bug.
- `texture.generateMipmaps = false; texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;` for the authentic PSX preset (no mip blending, no bilinear). The "clean" preset may re-enable mipmaps/trilinear for readability — gate this via the visual-preset system, not per-callsite.
- `texture.wrapS = texture.wrapT = THREE.RepeatWrapping` for tiling stadium panels; set `.repeat` explicitly rather than re-authoring UVs.

## Procedural textures

- `CanvasTexture` for UI-adjacent or dithered gradient content generated via `OffscreenCanvas`/`CanvasRenderingContext2D` (e.g. Bayer dither lookup tiles, boost-pad rings).
- `DataTexture` for raw computed pixel buffers (palette LUTs, noise fields) — construct with the correct `THREE.RedFormat`/`THREE.RGBAFormat` and `THREE.UnsignedByteType`, and set `.needsUpdate = true` after writing the buffer.
- Both must be generated from the deterministic seeded PRNG when used for gameplay-visible randomness (star placement masks, etc.).

## Caching

One `Texture` instance per source file, cached in the asset pipeline's texture registry. Consumers request by key; never call `new THREE.TextureLoader().load(...)` directly for the same file twice. Dispose only when the pipeline itself tears down (application lifetime), not per-match.
