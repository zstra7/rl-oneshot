# Asset Pipeline Deviations

Record deviations from `plan/asset_production_pipeline_module_spec.md`.

## Phase 0

- `.claude/skills/threejs-*` files were initially authored locally instead
  of vendored from `CloudAI-X/threejs-skills` (not accessible from this
  session).

## Phase 1

- Resolved: the user supplied the real skill content directly
  (`ACTUAL SKILLS TO USE/`, merged into `.claude/skills/threejs-*` and the
  staging folder removed). The Phase 0 placeholder content no longer
  applies. See `docs/implementation-progress.md` "Skill update".

## Phase 2

- `ballRadius`/`carHitboxSize` used by every procedural factory
  (`PLACEHOLDER_PHYSICS_METADATA` in `src/assets/AssetTypes.ts`) are
  asset-pipeline-authored placeholders, not values sourced from the
  physics module, because Phase 3 (physics) has not been implemented yet.
  The asset pipeline spec is explicit that physics dimensions are always
  authoritative (never the reverse) — Phase 3 must supply the real values
  and this placeholder must be removed/replaced at that point, not kept
  alongside a second authoritative source.
- `BrowserAssetTestApi` implements only `ready`, `getPipelineState`,
  `getLoadingProgress`, `getErrors`, `getSceneResourceCounts`,
  `rebuildProceduralPreview`, `disposePreview` — the full section 59
  interface also specifies car/texture-report and preview-camera methods
  that require car/texture intake (Phase 11/12), which do not exist yet.
- The development asset lab (`?assetLab=1`, section 58) was not built.
  It is optional developer tooling, not part of the Phase 2 exit criteria
  in `MASTER_BUILD_BRIEF.md`, and was skipped to stay within phase scope.
- Stadium blockout (`StadiumGeometryFactory.ts`) implements only floor,
  side walls, ceiling, and end walls with a rectangular goal cutout — no
  curved corner transitions, structural ribs, or glass layers (sections
  36-38). Those are explicitly Phase 14 ("Stadium art and VFX") per the
  Master Brief, not Phase 2's "basic stadium blockout".

## Phase 6

- `BoostPadVisualFactory.ts` implements only the states the physics
  module actually produces (`"active"`/`"respawning"`, driven by
  `BoostPadRenderBinding` from `pad.active`) plus an `"inactive"` state
  used only by the factory's own default/error handling. `"collected-
  pulse"` exists in the `BoostPadVisualState` union and is handled by
  `applyBoostPadVisualState()`, but nothing currently transitions a pad
  into it — a real flash-on-pickup VFX (distinct from just going straight
  to the dimmed "respawning" look) is deferred to Phase 14 (stadium art
  and VFX), consistent with all other VFX polish being out of scope until
  then.
- Per-pad ring materials are cloned via
  `MaterialRegistry.createInstanceMaterial`, one clone per `BoostPadId` —
  this is a deliberate, spec-consistent use of the registry's instance-
  material affordance (shared-by-default, explicit opt-out per instance
  when state must vary independently), not a new pattern invented outside
  the pipeline design.

## Phase 11

- **Assets moved from `assets/models/`/`assets/textures/` (repo root) to
  `public/assets/cars/`/`assets/textures/` (`assets/textures/` unchanged,
  deferred to Phase 12).** Spec section 85 explicitly expects
  `public/assets/cars/car.glb` — the repo-root `assets/` directory used
  since Phase 0 was never inside Vite's `publicDir` and had no dev-server
  URL. `scripts/validate-assets.mjs` was updated to check the new path.
- **`CarAssetDescriptor.expectedUpAxis`/`expectedForwardAxis` were
  determined via `THREE.GLTFLoader` + `Box3.setFromObject`, not the manual
  byte-level GLB parse done earlier in this phase's investigation.** That
  manual parse misread which raw accessor axis was which and concluded
  up=+Z/forward=+Y; the real loader shows up is already +Y (the file
  complies with glTF's nominal Y-up convention) and forward is +Z
  (confirmed visually — grille/headlights face +Z, trunk/tail-lights face
  -Z). See `docs/car-intake-report.md` for the full derivation. This
  produced a real, visually-obvious bug during development (the car
  rendered as a tall vertical "tower" — the model's 9m length axis got
  rotated onto the vertical axis) caught immediately via a Playwright
  screenshot, before it reached the committed descriptor values.
- **`visualScale` is a single compromise value (0.2), not an exact OBB
  fit on every axis** — the source model's realistic-sedan proportions
  (length/width ~2.4) don't match the physics hitbox's stubby
  Rocket-League proportions (~1.4). Spec section 16 explicitly permits
  this ("does not need to exactly fill the OBB, but should closely
  correspond"); the compromise favours width/height (most visually
  load-bearing from the chase camera) over an exact length match. See
  `docs/car-intake-report.md`.
- **`car.glb` has no separate wheel nodes or boost-socket nodes** (both
  meshes — body and wheels — are static, non-articulated). Spec section
  18 explicitly allows this ("a car without animated wheels remains
  valid"), so `CarAssetDescriptor.wheelNodes`/`boostSockets` are left
  undefined and wheel-spin/steering visual animation is not implemented
  for the real GLB (only the now-superseded `ProceduralCarFallback` never
  had procedural wheel spin either, so this is not a regression).
- **`PhysicsRenderBinding` now renders real per-car visuals (GLB or
  `ProceduralCarFallback`) and the real procedural ball visual, replacing
  the plain wireframe debug box/sphere used since Phase 3.** This was a
  known, explicitly-deferred gap ("real CarVisual/BallVisual instances...
  once match flow (Phase 7) creates actual match instances" — see Phase
  3/5 notes) that Phase 7 did not actually close; Phase 11 is the natural
  integration point since it is the phase that first produces a real car
  visual to bind.
- **Development/test fallback policy**: if a car descriptor fails to
  load/validate, `AssetPipeline` falls back to `ProceduralCarFallback` in
  dev/test builds (`!import.meta.env.PROD`) and throws (fails the whole
  pipeline) in a production build, matching spec section 20's "required
  car missing -> fail asset pipeline" production policy. In this repo's
  normal operation both car descriptors load successfully, so the
  fallback path is exercised only by intentionally-broken test scenarios,
  not real usage.
- **`AssetPipeline.initialise()` is now `async`** (it was synchronous
  through Phase 2-10) to await the real GLB load/validate step. This was
  already legal per `GameModule.initialise(): Promise<void> | void` and
  `GameRuntime.initialise()` already `await`s every generic module in its
  init loop, so no caller needed to change.
- Car intake inspection (spec section 13) is exposed for automated/manual
  use via `window.__ASSET_TEST__.getCarIntakeReports()` (new test-only
  method, gated the same as the rest of `BrowserAssetTestApi`) rather than
  a dedicated `?assetLab=1` development UI — consistent with Phase 2's
  decision to skip the asset lab as out of scope.

## Phase 12

- **Textures moved from `assets/textures/` (repo root) to
  `public/assets/textures/`**, same reasoning as the Phase 11 car GLB move
  — the repo-root location has no dev-server URL. Three vendor
  catalog/preview images (`Listing_image.png` 1260x1000, `Render.png`
  1920x1080, `Thumbnail.png` 256x256 — clearly not in-game textures, see
  `docs/asset-attribution.md`) were deliberately left behind at
  `assets/textures/`, not moved and not added to the manifest.
- **The 298-entry texture manifest (`TextureManifestData.ts`) is
  generated, not hand-authored** (`scripts/generate-texture-manifest.mjs`,
  same "write a script for scale, review its output" precedent as the
  car's inspection tooling). Every entry is classified
  `semantic: "color"` — the supplied library has no separate normal/
  roughness/metalness/AO map filenames (checked by hand against the full
  file listing before writing the script), so this is a real authorial
  classification decision recorded in the script's own comments, not code
  "discovering" semantics from filenames at runtime (spec section 22
  explicitly warns against the latter).
- **No manifest texture is currently marked `required: true`.** Spec
  section 25/26 ties `required` to real fail-the-pipeline behaviour
  (dev shows a checker, production fails outright) — with 298 supplied
  files and only 2 currently wired into any material, marking any of them
  `required` would be premature (a later Phase 14 stadium-art pass, once
  it decides which specific textures a specific material actually
  depends on, is the right place to promote those to `required: true`).
- **Only 2 of the 298 supplied textures (`ConcreteFloor-01_64.png` for
  the stadium floor, `ConcretePanel-01_64.png` for the stadium walls/
  ceiling) are eagerly loaded and applied at boot**
  (`AssetPipeline.loadAndValidateStadiumTextures`,
  `StadiumGeometryFactory.ts`), replacing the flat placeholder colours
  used since Phase 2. This is a deliberate, scoped proof that the
  load-validate-configure-apply pipeline works end to end against a real
  supplied texture, not full stadium re-texturing — the Master Brief
  reserves "Stadium art and VFX" for Phase 14. The remaining 296 entries
  are fully catalogued (`docs/texture-intake-report.md`) and loadable on
  demand via the new `AssetPipeline.loadTexture()`/
  `TextureAssetLoader.load()`, just not eagerly fetched for surfaces
  nothing currently renders.
- **`TextureAssetLoader`'s missing-required-texture fallback (spec
  section 26) uses a `THREE.DataTexture`-based magenta/black checker, not
  a `CanvasTexture` built via `document.createElement("canvas")`** — kept
  DOM-independent so the same loader code path is exercisable from
  Vitest's Node test environment (no `document` global there) as well as
  a real browser, rather than requiring a jsdom environment switch for
  one fallback texture.
- Asset attribution (spec section 27, `docs/asset-attribution.md`) is
  complete for the car (embedded `asset.extras` gave a real author/
  licence) but the texture library's licence is recorded as
  **unknown/unspecified** — no licence metadata was bundled with the
  supplied files, and the pipeline cannot infer legal rights (spec
  section 27's own explicit caveat). Flagged for the project owner to
  confirm before any public distribution.
