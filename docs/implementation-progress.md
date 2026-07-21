# Current Phase

Phase: 2 — Asset and Procedural Foundation
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `AssetPipeline` (`src/assets/AssetPipeline.ts`) replaces `NullAssetPipeline`
  as the real `assets` module slot. Runs the lifecycle from asset pipeline
  spec section 8 (`IDLE -> VALIDATING_SKILLS -> VALIDATING_MANIFEST ->
  LOADING_AUTHORED_ASSETS -> VALIDATING_AUTHORED_ASSETS ->
  BUILDING_PROCEDURAL_RESOURCES -> WARMING_SHADERS -> READY`), reachable via
  `window.__ASSET_TEST__.getPipelineState()`.
- `GameAssetManifest` (`AssetManifest.ts`, schemaVersion 1) with `player`/
  `opponent` car descriptors both marked `"fallback"` (no supplied GLB
  wired in yet — Phase 11) and an empty `textures` record (Phase 12).
  Validated by `validateAssetManifest()`.
- `AssetLoadingManager` wraps one shared `THREE.LoadingManager`
  (unused for now since Phase 2 has no required authored assets, but ready
  for GLTFLoader/TextureLoader in Phase 11/12).
- Procedural foundation: `SeededRandom` (mulberry32, deterministic),
  `GeometryRegistry` / `MaterialRegistry` (ref-counted sharing + disposal),
  `ProceduralAssetContext`.
- Procedural content factories: `createProceduralCarFallback` (boxes +
  tapered cabin + cylinder wheels + forward marker + boost socket, team
  tinted), `createBallVisual` (faceted icosahedron + enlarged wireframe
  seam layer), `createStadiumBlockout` (floor/side walls/ceiling/end walls
  with a goal cutout — deliberately just a blockout; ribs/glass/curves are
  Phase 14), `createDefaultStarfield` (three `THREE.Points` layers, one
  draw call each).
- `PlaceholderSceneRenderer` extended with `addToScene`/`removeFromScene`
  and basic hemisphere+directional lighting so `MeshStandardMaterial`
  content is visible; camera repositioned inside the blockout so the
  placeholder world is actually visible (verified via screenshot — ball,
  car, goal cutout, starfield all visible).
- `window.__ASSET_TEST__` (`BrowserAssetTestApi`) installed under
  `__DEV__ || __TEST_BUILD__`: `ready()`, `getPipelineState()`,
  `getLoadingProgress()`, `getErrors()`, `getSceneResourceCounts()`,
  `rebuildProceduralPreview(seed)`, `disposePreview()`.
- `GameRuntime.initialise()` now builds the placeholder world via
  `modules.assets.buildPlaceholderWorld()` and adds it to the scene; its
  `RuntimeDiagnostics.assets` field is now populated from the real asset
  pipeline's loading progress/errors instead of a zeroed stub.

## Failing
- None. All Phase 2 exit criteria verified locally in this session.

## Deferred
- Car GLB intake/validation/alignment, texture intake, glass/ribs/field
  markings, boost pad visuals, shader library, development asset lab
  (`?assetLab=1`) — all later phases (11, 12, 14) per the asset pipeline
  spec's own internal phased plan (section 83). See Known deviations.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 7 files, 29 tests, all passing, including:
  - `SeededRandom` determinism (same seed -> identical sequence, different
    seed -> different sequence, bounds checks).
  - `GeometryRegistry`/`MaterialRegistry` caching, ref-counting, and
    disposal behaviour.
  - `proceduralDeterminism.spec.ts`: same seed produces byte-identical
    starfield vertex data and identical stadium bounding boxes across two
    fully independent builds; different seed produces different data.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright `tests/smoke/**` — 2/2 passing on `chromium-dev` and
  `chromium-preview` (plain production build).
- Playwright `tests/integration/**` (4 tests) and
  `tests/procedural/placeholder-world.spec.ts` (3 tests) — 7/7 passing on
  `chromium-dev`, and on `chromium-preview` against a `PLAYWRIGHT_TEST=1`
  test-mode build (same caveat as Phase 1 — see `docs/build-decisions.md`).
  Procedural tests verify: pipeline reaches `READY` with zero errors and a
  populated scene; no external (cross-origin) asset requests are ever
  made; `rebuildProceduralPreview(seed)` is deterministic given the same
  seed and `disposePreview()` leaves the pipeline in a usable `READY`
  state afterward.

## Next exact task
- Begin Phase 3 (physics foundation) per `plan/MASTER_BUILD_BRIEF.md` and
  `plan/threejs_rocket_league_physics_module_spec_v2_1_boost_pads.md`.
  Required reading before starting: Core Architecture spec (already read)
  + this progress file + the physics module spec only. Implement Rapier
  initialisation, a fixed 120 Hz world, the ball rigid body, two car rigid
  bodies, a flat/blockout arena collider (derived from the same
  `StadiumGenerationDimensions` the asset pipeline already uses — replace
  `PLACEHOLDER_PHYSICS_METADATA` in `src/assets/AssetTypes.ts` with the
  real authoritative values once physics defines them), manual stepping,
  a physics test API, render snapshots, speed clamps, and basic
  collisions. Do not implement the advanced car controller yet (Phase 5).
  Do not touch asset/visual code beyond wiring physics render snapshots
  into car/ball transforms.

## Known deviations
- `AssetLoadingManager`/`LOADING_AUTHORED_ASSETS`/
  `VALIDATING_AUTHORED_ASSETS` states currently do nothing observable
  (Phase 2 has zero required authored assets — the manifest's car
  descriptors are both `"fallback"` and `textures` is empty). They exist
  as real pipeline states/wiring so Phase 11/12 only need to add loader
  calls, not restructure the lifecycle.
- `PLACEHOLDER_PHYSICS_METADATA` (`ballRadius: 0.9`,
  `carHitboxSize: {1.2, 0.8, 1.9}`) in `src/assets/AssetTypes.ts` is an
  asset-pipeline-owned placeholder since Phase 3 (physics) has not defined
  the authoritative values yet. Per the asset spec, physics dimensions are
  always authoritative — Phase 3 must replace this constant (or the
  `ProceduralAssetContext.physicsMetadata` source) with the real physics
  arena/hitbox definition, not the other way around.
- The full `BrowserAssetTestApi` from asset pipeline spec section 59 also
  lists `listCarReports`, `createCarPreview`, `setCarPreviewCamera`,
  `showProceduralAsset`, `simulateMissingTexture`, `simulateMissingCar`,
  and `getAssetReport()`. Only the subset that Phase 2 actually implements
  is present (see `src/assets/testing/BrowserAssetTestApi.ts`); the rest
  requires car/texture intake (Phase 11/12) or the development asset lab
  UI (section 58, optional dev tooling) and is deferred.
- `ModuleContainer.assets` is now typed as the concrete `AssetPipeline`
  (narrowed from the generic `GameModule` used in Phase 1). All other
  slots remain generic until their own phase reads that module's spec.
- Carried over from Phase 1: `window.__GAME_TEST__`/`__ASSET_TEST__` only
  install when `__TEST_BUILD__` is true, which the literal `test:release`
  script (plain `npm run build`) does not set — see
  `docs/build-decisions.md`.
