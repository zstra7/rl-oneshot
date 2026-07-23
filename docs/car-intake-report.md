# Car Intake Report

Generated (asset pipeline spec section 13) from `CarAssetLoader`'s
inspection of the supplied `public/assets/cars/car.glb`, loaded live in a
Chromium/Playwright session (`AssetPipeline.getCarIntakeReports()` via
`window.__ASSET_TEST__.getCarIntakeReports()`). One shared file backs both
the `player-car` and `opponent-car` descriptors (spec section 85's "one
shared `car.glb`" option), so both reports below are identical except for
which descriptor requested them.

## Source

- File: `public/assets/cars/car.glb` (78,944 bytes)
- Author: spatka (Sleepless) — "PSX style Pontiac Ventura 1977's", Sketchfab,
  CC-BY-4.0 (https://sketchfab.com/3d-models/psx-style-pontiac-ventura-1977s-8a63069b223e4ab88bac635d886559c7).
  Full attribution: `docs/asset-attribution.md`.
- Format: GLB 2.0, self-contained (embedded buffer + textures)

## Inspection report

| Field | Value |
| --- | --- |
| `nodeCount` | 7 |
| `meshCount` | 2 |
| `skinnedMeshCount` | 0 |
| `materialCount` | 2 |
| `textureCount` | 2 |
| `triangleCount` | 388 |
| `vertexCount` | 1134 |
| `animationClips` | (none) |
| `extensionUsage` | `KHR_materials_unlit` |
| `warnings` | (none) |
| `errors` | (none) |

Triangle/vertex/material counts are all far under the spec section 14.2
warning thresholds (50,000 tri / 32 materials / 16 textures) and well
inside the "1,200-10,000 triangles per car" recommended target (indeed
below the earlier 1,200-2,000 PSX-ideal floor, so nothing was flagged for
reduction).

### Node names

`Sketchfab_Scene`, `Sketchfab_model`, `96751eea4adb44de929cfaf1dc0f273cfbx`,
`RootNode`, `car`, `car_M_car_0` (mesh 0, body), `car_M_Wheels_0` (mesh 1,
wheels). No node carries an explicit TRS — the two meshes' own vertex data
define the car's raw orientation/scale directly. No separate wheel nodes
or boost-socket nodes exist (`CarAssetDescriptor.wheelNodes`/
`boostSockets` are left undefined for this asset — spec section 18: "a car
without animated wheels remains valid").

### Material names

`M_car` (body, matched to the `team-primary` tint role — required),
`M_Wheels` (wheels, matched to the `wheel` role — left untouched, not
team-tinted).

### Source bounds (raw model space, both meshes combined)

```text
min:    (-1.9496, -0.0324, -4.6740)
max:    ( 1.8760,  2.4006,  4.4057)
size:   ( 3.8256,  2.4329,  9.0797)   // X width, Y up, Z length
centre: (-0.0368,  1.1841, -0.1342)
```

## Axis/orientation findings

- **Up axis is already +Y** — the source file complies with glTF's
  nominal Y-up convention. (An earlier manual byte-level parse of the raw
  GLB JSON+accessor chunks, done before `GLTFLoader`/`THREE.Box3` were
  wired up, misread the accessor layout and concluded up was +Z; that
  reading was wrong and is superseded by this report, which used the real
  loader.)
- **Forward (nose) axis is +Z**, confirmed visually: a Playwright
  screenshot looking down -Z at the loaded, unrotated model showed a hood,
  windshield, and a grille/bumper with distinct headlight segments (the
  front); the opposite view showed a trunk lid, rear window, and a
  tail-light bar (the rear).
- This project's physics car frame considers local forward to be -Z
  (`Vec3Math.LOCAL_FORWARD`), so `CarDescriptors.ts` applies a 180 degree
  rotation about Y (`visualRotationEuler = {0, PI, 0}`) to correct it — no
  X/Z rotation is needed since up already matches.
- The raw model's own Y=0 sits almost exactly at the wheel/ground-contact
  height (min Y = -0.032, very close to 0), i.e. it was authored with its
  origin near the ground plane rather than centred on its bounding box.
  `visualOffset.y` was derived to align that ground-contact point to
  `-CAR_HALF_EXTENTS.y` in the physics-hitbox-centred local frame instead
  of naively centring the Y bounds.

## Scale reconciliation

The source model has realistic full-size-sedan proportions
(length/width/height ratio roughly 9.08 : 3.83 : 2.43, i.e. length/width
~2.4). The authoritative physics hitbox (asset pipeline spec section 16)
is Length 1.1801m / Width 0.8420m / Height 0.3616m, a much stubbier
Rocket-League-style ratio (length/width ~1.4). Because
`CarAssetDescriptor.visualScale` is a single uniform scalar, no one value
exactly fills the OBB on every axis simultaneously — the spec explicitly
allows this ("does not need to exactly fill the OBB, but should closely
correspond"). `CarDescriptors.ts` uses `visualScale = 0.2`, chosen to keep
the on-field width/height footprint (the most visually load-bearing
dimensions from the chase camera) close to the physics hitbox, at the cost
of a visually longer body (resulting footprint after scale: width 0.765m,
height 0.487m, length 1.816m — see `docs/asset-pipeline-deviations.md`).

## Validation result

`validateCarAsset` (asset pipeline spec section 14.1) passes with no
errors for both `player-car` and `opponent-car`: a mesh is present, source
bounds are finite and non-zero, and the required team-tint target
(`M_car`) is present. No warnings are raised (triangle/material/texture
counts are all well under threshold).
