---
name: threejs-loaders
description: GLTFLoader setup, DRACO/meshopt considerations, and safe car-GLB ingestion for the supplied-asset pipeline.
---

# Three.js Loaders (r160)

## GLTFLoader

```ts
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const gltf = await loader.loadAsync(carGlbUrl);
```

- Only set up `DRACOLoader`/`KTX2Loader` if a supplied GLB actually requires that extension (check `gltf.parser.json.extensionsUsed` or inspect the file first) — do not add compression-loader plumbing speculatively for an uncompressed asset.
- `loader.loadAsync` returns once per call; cache the resulting `gltf.scene` as the canonical source and never re-`loadAsync` the same file for a second car instance — clone via `SkeletonUtils.clone(gltf.scene)` for skinned rigs, or `object.clone(true)` for a static hierarchy without skinning.

## Validation before use

Before binding a supplied car GLB to gameplay:

1. Confirm it parses without throwing.
2. Compute its bounding box and compare against the physics hitbox dimensions (do not resize the hitbox to match — flag a deviation instead if wildly mismatched).
3. Walk the node hierarchy for expected wheel/body node names if the asset-pipeline spec's naming convention is used; fall back to the procedural car if absent, and report it in `docs/car-intake-report.md`.

## Failure handling

Wrap `loadAsync` in try/catch. On failure, fall back to `ProceduralCarFallback` and emit an `assets:error` event — never leave a car slot empty or throw past the asset pipeline boundary. Production builds must not show a silently missing mesh.

## Never

Do not introduce a second loader family (e.g. FBXLoader, OBJLoader) — the only authored 3D input is car GLBs via `GLTFLoader`.
