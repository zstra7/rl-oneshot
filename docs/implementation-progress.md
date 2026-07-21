# Current Phase

Phase: 11 — User Car GLB Integration
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/assets/cars/CarModelTypes.ts`: the asset pipeline spec section
  11.3/13/17 types (`CarAssetDescriptor`, `MaterialTargetRule`,
  `TeamVisualProfile`, `CarAssetInspectionReport`, `LoadedCarSource`).
- `src/assets/cars/CarDescriptors.ts`: real, calibrated descriptors for
  the supplied `car.glb` (shared by `player-car`/`opponent-car` — spec
  section 85's "one shared car.glb" option), with `expectedUpAxis`/
  `expectedForwardAxis`/`visualScale`/`visualOffset`/`visualRotationEuler`
  all derived from a real inspection + Playwright screenshot verification
  — see `docs/car-intake-report.md` for the full derivation and
  `docs/asset-pipeline-deviations.md` for a real bug this caught.
- `src/assets/cars/CarAssetLoader.ts`: a cached `GLTFLoader`
  (cache-by-URL — "load once" for the shared file), `createInstance`
  builds the spec section 15 normalisation hierarchy (`CarPhysicsRoot` ->
  `CarVisualOffset` -> `CarTeamVisualRoot` -> `LoadedGlbScene`), clones and
  colour-mutates only the team-tint-targeted material per instance
  ("clone twice" — team-tinted body material cloned per team, wheel
  material and all geometry/textures stay shared), and builds the section
  13 inspection report from the loaded GLTF.
- `src/assets/cars/CarValidation.ts`: the spec section 14.1 required
  checks (no mesh / non-finite or zero bounds / missing required
  team-tint target / missing declared wheel node or boost socket) and
  14.2 warnings (triangle/material/texture count thresholds).
- `src/assets/AssetPipeline.ts`: `LOADING_AUTHORED_ASSETS`/
  `VALIDATING_AUTHORED_ASSETS` now actually load+validate both car
  descriptors (previously no-ops since Phase 2); `createCarVisual(team)`
  returns the real GLB instance when valid or `ProceduralCarFallback`
  otherwise (dev/test only — production fails the pipeline, spec section
  20); `createBallVisual()`/`getCarIntakeReports()`/
  `isCarUsingFallback()` are new public accessors.
- **`src/integration/PhysicsRenderBinding.ts` now renders real per-car
  visuals and the real procedural ball visual every frame**, replacing
  the plain wireframe debug box/sphere used since Phase 3 — this is the
  change that actually makes Phase 11 visible in live gameplay, not just
  in an unused loader. Car team (for tint) is resolved from the physics
  `CarId` (`car-player`/`car-opponent`).
- `AssetManifest.ts`'s `GAME_ASSET_MANIFEST.cars.player/opponent` now
  reference the real descriptors (`source: "glb"` semantics implicit in
  the richer descriptor type); `validateAssetManifest` gained car-specific
  checks (duplicate id, missing url when required, no required team-tint
  target declared).
- `assets/models/car.glb` moved to `public/assets/cars/car.glb` (spec
  section 85's expected layout — see `docs/build-decisions.md`).
- `window.__ASSET_TEST__`: `getCarIntakeReports()`/`isCarUsingFallback()`
  for deterministic Playwright verification (spec section 59's
  `listCarReports`, deferred since Phase 2).
- `docs/car-intake-report.md`: the spec section 13 human-readable report,
  generated from a real Playwright-driven load of the supplied `car.glb`.

## Failing
- None. All Phase 11 exit criteria verified locally in this session.

## Deferred
- Wheel visual animation (spin/steer, spec section 18) — the supplied
  `car.glb` has no separate wheel nodes (both meshes are static), and the
  spec explicitly allows this ("a car without animated wheels remains
  valid"). Would need a car with articulated wheel nodes to implement.
- Car animation clips (spec section 19) — the supplied GLB has none.
- Draco/Meshopt/KTX2 decoder support (spec section 11.2) — the supplied
  GLB is uncompressed, so no decoder is configured; would need to be
  added if a future compressed GLB is supplied.
- The full interactive "development alignment scene" with a live GUI
  panel for scale/offset/rotation (spec section 16) was not built as
  permanent tooling — alignment was done via ad hoc Playwright screenshot
  iteration (moving the placeholder-world camera, inspecting the result,
  adjusting the descriptor, rebuilding) during this session, then the
  final values were hardcoded into `CarDescriptors.ts` per the spec's own
  "save values in descriptor code, do not rely on runtime GUI values."
  Playwright side/front/top/chase captures exist as test artifacts
  (`tests/assets/car-visual.spec.ts`) but not as a dedicated multi-angle
  alignment rig.
- Skinned-mesh/skeleton-cloning support (spec section 12) — the supplied
  GLB has no skinned meshes (`skinnedMeshCount: 0`), so `createInstance`'s
  plain `Object3D.clone(true)` is sufficient; a future skinned car would
  need the proper skeleton-cloning pattern instead.

## Tests passing
- `npm run validate` — all four validators pass (`validate-assets.mjs`
  updated to check `public/assets/cars/` instead of the old
  `assets/models/`).
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 16 files, 129 tests, all passing,
  including a new `carAsset.spec.ts` (19 tests): descriptor sanity,
  manifest validation (including the real `GAME_ASSET_MANIFEST` and a
  synthetic duplicate-id case), all `CarValidation` required-check/warning
  branches, `matchTargetInReport`'s three match modes, and
  `CarAssetLoader.createInstance`'s hierarchy/scale/rotation and
  team-material-cloning behaviour (including "the original cached source
  material is never mutated" and "the untouched wheel material is the
  exact same shared instance across both teams"). All 110 prior tests
  (Phases 1-10) still pass unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 43 prior tests still pass, plus a new
  `tests/assets/car-visual.spec.ts` (4 tests): both car descriptors load
  and validate the real `car.glb` with zero errors, both cars report
  `isCarUsingFallback() === false` (proving the real GLB is in use, not
  silently falling back), a live match drives with the real car visuals
  bound to physics and stays finite/on-ground, and the menu presentation
  shows both team-tinted cars with no console errors — 47/47 total on
  `chromium-dev` and `chromium-preview`. Verified visually via Playwright
  screenshots (ad hoc, during development) of the car's front, rear, and
  side, and (committed test artifacts) of a live match and the menu
  presentation, all showing the real textured PSX Pontiac Ventura model
  correctly oriented, scaled, grounded, and team-tinted — not the prior
  wireframe debug box.

## Next exact task
- Begin Phase 12 (user texture integration) per `plan/MASTER_BUILD_BRIEF.md`
  and asset pipeline spec sections 21+ (Supplied Texture Contract). The
  supplied texture library already exists in `assets/textures/` (dozens
  of PNG files) but is not yet wired into the pipeline or moved to
  `public/assets/textures/`. Required reading before starting: the asset
  pipeline spec's texture intake/classification/validation sections (not
  yet read in depth). Do not touch PSX post-processing (Phase 13) yet.

## Known deviations
- **A real bug found and fixed during this phase: an earlier manual
  byte-level parse of the raw GLB (done before `GLTFLoader` was wired up)
  misread the accessor axis layout and concluded the source model's up
  axis was +Z; it is actually +Y (glTF's nominal convention, which this
  file complies with).** Applying the resulting (wrong) axis-correction
  rotation produced a car that rendered as a tall vertical "tower" (the
  model's ~9m length axis got rotated onto the vertical axis) — caught
  immediately via an ad hoc Playwright screenshot before it was committed.
  Re-deriving the axes from `THREE.Box3.setFromObject()` on the actually-
  loaded scene (ground truth) and re-verifying the forward sign visually
  (nose vs tail) fixed it. See `docs/car-intake-report.md` and
  `docs/asset-pipeline-deviations.md` Phase 11.
- `visualScale` is a uniform compromise (0.2), not an exact fit on every
  axis, because the source model's realistic-sedan proportions don't
  match the physics hitbox's stubby Rocket-League proportions — spec
  section 16 explicitly permits this.
- No wheel nodes/boost sockets/animation clips exist on the supplied
  model — see Deferred above.
- Carried over from Phase 1-10: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
