# Build Decisions

## Phase 0

- Followed `plan/core_application_architecture_build_integration_spec.md`
  section 4 for the initial `package.json` manifest. Pinned versions that
  matched the spec exactly and were verified compatible with each other:
  `three@0.160.0`, `vue@3.5.40`, `pinia@4.0.2`,
  `@dimforge/rapier3d-compat@0.19.3`, `@playwright/test@1.61.1`,
  `@vitejs/plugin-vue@6.0.8`, `vite@8.1.5`, `vue-tsc@3.3.7`.
- **`typescript`**: the spec pins `7.0.2`. That version exists on npm but is
  the new native/Go-rewrite package layout (ESM-only, no
  `typescript/lib/tsc` CJS entry point). `vue-tsc@3.3.7` requires the
  classic `typescript/lib/tsc` entry and crashes immediately against
  `typescript@7.0.2`. Pinned `typescript@5.9.3` instead (last stable classic
  release, satisfies vue-tsc's `>=5.0.0` peer range). Recorded here per
  section 80 ("Type-check failure" triage — fix types/toolchain, do not
  disable strictness) rather than in `docs/integration-deviations.md` since
  this is a build-tooling pin, not a module contract deviation.
- **`vitest`**: the spec left the exact version to be chosen "after
  scaffolding and verifying compatibility with the chosen Vite version"
  (section 3.7). `vitest@3.2.4`/`3.2.7` only support Vite `^5 || ^6 || ^7`
  and bring in a duplicate nested `vite` package that conflicts with the
  pinned `vite@8.1.5` at the type level (`ImportMeta.hot` declaration
  merge conflict during `vue-tsc --noEmit`). Pinned `vitest@4.1.10`, the
  first stable line that declares `vite: "^6.0.0 || ^7.0.0 || ^8.0.0"` as a
  dependency and resolves to a single shared `vite` install matching
  `8.1.5`.
- **`@types/node` (22.20.1) and `@types/three` (0.160.0)** were added as
  devDependencies. The spec states "Do not install `@types/three`; Three.js
  includes its own types" — that is not accurate for the pinned
  `three@0.160.0`: the installed package ships zero `.d.ts` files (Three.js
  only started bundling its own types in a later release than r160).
  Without `@types/three`, `vue-tsc --noEmit` fails on every `three` import.
  Installed the exact-matching `@types/three@0.160.0` release instead, and
  recorded this in `docs/integration-deviations.md`. `@types/node` was
  required because `vite.config.ts`/`playwright.config.ts`/`tests/unit/**`
  reference Node globals (`process`, `Buffer`, `node:fs`, etc.) under
  `strict`/`noUncheckedIndexedAccess` TypeScript.
- `vite.config.ts`'s `rollupOptions.output.manualChunks` was changed from
  the spec's object-map shorthand to an explicit function. Vite 8's bundled
  Rollup version rejects the object form used in the spec's example
  (`ManualChunksFunction` type mismatch) — the function form is equivalent
  in behaviour (vue+pinia / three / rapier chunk names) and compiles.
- `.claude/skills/threejs-*` were authored locally rather than vendored from
  `CloudAI-X/threejs-skills` (that repository is not in this session's
  accessible scope). See `docs/implementation-progress.md` known
  deviations and `docs/asset-pipeline-deviations.md`.
- Playwright config adds a `webServer` block (dev + preview) not present in
  the spec's example config, so `npm run test:e2e:dev` / `test:e2e:preview`
  work without a human manually starting servers first. This does not
  change the two required projects (`chromium-dev`, `chromium-preview`).
- `playwright.config.ts` reads an optional `PLAYWRIGHT_CHROMIUM_PATH` env
  var into `use.launchOptions.executablePath`. This session's sandboxed
  execution environment ships a pre-installed Chromium build at a fixed
  path instead of the exact revision `@playwright/test@1.61.1` expects, and
  network installs of browser binaries are not part of this workflow. The
  env var is optional and `undefined` by default, so a normal checkout that
  has run `npx playwright install` is unaffected.

## Phase 1

- `window.__GAME_TEST__` only installs when `__DEV__ || __TEST_BUILD__`
  (section 46). `vite.config.ts` sets `__TEST_BUILD__` from
  `mode === "test" || process.env.PLAYWRIGHT_TEST === "1"`. The literal
  `test:release` script in section 4 runs a plain `npm run build` (no
  `PLAYWRIGHT_TEST` set) before testing against the preview server, which
  means `tests/integration/**` (which depend on `window.__GAME_TEST__`)
  would not find the test API on that exact build. Section 46 explicitly
  permits "a test-mode production build" for release testing, so when
  verifying `tests/integration/**` against `chromium-preview` in this
  session, the build was run as `PLAYWRIGHT_TEST=1 npm run build:app`
  instead of plain `npm run build:app`. `tests/smoke/**` and
  `tests/release/**` do not depend on the test API and pass against an
  ordinary production build. If this distinction matters for a real CI
  release gate later, consider splitting `test:release` into a
  test-API-independent smoke/release pass (plain production build) and a
  separate test-mode-build pass for `tests/integration/**`.

## Phase 7

- **`AppState` stays a 3+3-value type, not the game-flow spec's literal
  3-value `"BOOT"|"MENU"|"MATCH"`.** `src/core/ApplicationState.ts`'s
  `AppState` (`BOOT`/`LOADING`/`MENU`/`MATCH`/`FATAL_ERROR`/`DISPOSED`)
  predates Phase 7 and is load-bearing for startup-failure handling
  (`ContractRegistry`, `ErrorReporter`). `GameRuntime.mapMatchStateToAppState`
  maps `MatchFlowController`'s richer `MatchState` onto it instead:
  `MAIN_MENU`/`MATCH_SETUP`/`SETTINGS` -> `"MENU"`, everything else
  (including `MATCH_RESULTS`, still part of the match session until the
  player returns to the menu) -> `"MATCH"`.
- **`window.__GAME_TEST__.gameFlow` mutating methods call an explicit
  `notifyStateChanged`/`emitSessionStateChanged` after the underlying
  `MatchFlowController` call**, rather than relying solely on the normal
  per-tick `runtime:session-state-changed` emission. Found necessary
  because Playwright's deterministic match-flow tests pause the real rAF
  loop first (same established pattern as `tests/physics/foundation.spec.ts`)
  and then call menu-navigation actions (`openMatchSetup`, `pause`, etc.)
  that do not themselves go through a fixed tick — without the explicit
  notify, the Vue UI would not reflect the new state until the next manual
  `advanceGameTicks()` call.
- `runtime:session-state-changed` is emitted once per **fixed tick**
  (inside `onFixedTick`), not once per rendered frame. An earlier version
  emitted it from the rAF `frame()` method directly, but that requires a
  companion component-owned `requestAnimationFrame` polling loop to read
  it reactively — which is itself a second concurrent rAF loop and broke
  `tests/integration/runtime.spec.ts`'s "exactly one requestAnimationFrame
  is ever pending" invariant (core architecture spec: one rAF loop, full
  stop). Emitting from `onFixedTick` needs no extra rAF call at all, and
  also fires correctly when ticks are driven by
  `stepFixedTicksForTesting`/`advanceGameTicks` while the rAF loop itself
  is paused.

## Phase 8

- **`ModuleContainer.camera` was deliberately left as `NullCameraModule`**
  rather than swapped for a concrete `ChaseCameraController` type (the
  pattern used for `gameFlow`/`input` in earlier phases). The camera
  controller needs two things that do not exist when `ModuleContainer`'s
  generic slots are eagerly constructed: the `THREE.PerspectiveCamera`
  created by `PlaceholderSceneRenderer.initialise()`, and the ready
  `MatchFlowController`. Rather than threading those through the
  container, it is constructed and registered directly in
  `GameRuntime.initialise()` as an integration binding — the exact same
  pattern already used for `PhysicsRenderBinding` and
  `BoostPadRenderBinding` (both of which also need post-construction
  wiring the generic container can't provide). See
  `src/camera/NullCameraModule.ts`'s doc comment.
- **Gameplay input is now sampled once per fixed tick unconditionally**,
  not only when `gameFlow.areControlsActive()`. Camera-relevant edges
  (ball-camera toggle, swivel, rear view) need to reach the camera
  controller even during countdown/pause/celebration (real games let you
  toggle ball-cam or look around while waiting for kickoff); only the
  `CarInput` half of the sampled frame is still gated behind
  `areControlsActive()` before being handed to physics.

## Phase 9

- `OPPONENT_AI_CONTRACT_VERSION` was not added/wired into
  `validateModuleContracts()`, consistent with the existing precedent
  that `PHYSICS_MODULE_CONTRACT_VERSION` and the game-flow contract are
  also defined but not threaded through that call (see Phase 1 section
  above) — `GameRuntime.initialise()` still calls
  `validateModuleContracts([])`.
- `AiUpdateContext` (this project's own type, not the full AI spec
  section 3 `AiUpdateContext`) omits `recentPhysicsEvents` and most of
  `AiMatchContext` — see `docs/implementation-progress.md` Phase 9
  "Deferred" section for the full list and why.

## Phase 10

- `AiDifficultyParameters` is the spec's full section 7 struct (all
  three presets copied verbatim from the spec's recommended values), but
  this project's simplified planner only actually reads a subset:
  `reactionDelaySeconds`, `perceptionPositionNoise`/
  `perceptionVelocityNoise`, `tacticalHz`, `defensiveUrgency`,
  `challengeAggression`, `boostPadAwarenessRadius`, `dodgeSkill`,
  `aerialSkill`, `maximumAerialTime`, `mistakeFrequency`. Fields tied to
  systems this phase doesn't build (`candidateCount`, `shotAccuracy`,
  `shotPowerPreference`, `boostConservation`,
  `maximumBoostBurstSeconds`, `boostPadDetourToleranceSeconds`,
  `boostPadRespawnPlanningSeconds`, `boostDenialAggression`,
  `boostRouteCandidateCount`, `powerslideSkill`, `decisionTemperature`,
  `commitmentSeconds`, `maximumAerialHeight`, `kickoffProfile`,
  `predictionHz`, `controlHz`, `planningHorizonSeconds`) are kept on the
  type for spec fidelity and future use, not consumed yet.
- `AiRandom` (mulberry32) is a local copy of the same algorithm the asset
  pipeline's `SeededRandom` uses, not an import from `@/assets` — kept
  the AI module self-contained rather than adding a cross-module
  dependency for a few lines of PRNG math.

## Phase 11

- `assets/models/car.glb` was moved (`git mv`) to
  `public/assets/cars/car.glb` so Vite's default `publicDir` serves it at
  a real dev/preview-server URL, matching asset pipeline spec section 85's
  expected layout. `assets/textures/` was left in place (Phase 12).
- `AssetManifest.ts`'s own placeholder `CarAssetDescriptor` (an `{id,
  source: "fallback"|"glb", url?}` shape, unused since Phase 2) was
  replaced by the asset pipeline spec section 11.3 `CarAssetDescriptor`
  (now defined in `src/assets/cars/CarModelTypes.ts`) — a grep confirmed
  the old type had no other consumers, so there was no compatibility
  surface to preserve.
- `AssetPipeline.initialise()` changed from synchronous to `async` to
  await the real car GLB load/validate step (see
  `docs/asset-pipeline-deviations.md` Phase 11). This was already legal
  per the `GameModule` contract and required no caller changes.

## Phase 12

- `assets/textures/*.png` (298 real in-game textures) was moved (`git
  mv`) to `public/assets/textures/`, same reasoning as the Phase 11 car
  GLB move. Three vendor catalog/preview images (not in-game textures)
  were deliberately left at `assets/textures/` — see
  `docs/asset-attribution.md`.
- `AssetManifest.ts`'s own placeholder `TextureAssetDescriptor`/
  `TextureAssetId` types (unused since Phase 2, `textures: {}`) were
  replaced by re-exports of the richer types now defined in
  `src/assets/textures/TextureTypes.ts`, and `GAME_ASSET_MANIFEST.textures`
  is now populated from the generated `TEXTURE_MANIFEST_ENTRIES` — same
  consolidation pattern used for `CarAssetDescriptor` in Phase 11.
- `TextureManifestData.ts` (298 descriptor entries) is generated by
  `scripts/generate-texture-manifest.mjs`, not hand-written — see
  `docs/asset-pipeline-deviations.md` Phase 12 for the classification
  reasoning.

## Phase 13

- Governed by a different spec file
  (`plan/psx_visual_stadium_game_loop_spec_v1_1_boost_pads.md`) than
  Phases 0-12's core/asset-pipeline specs — its own deviations are
  tracked separately in `docs/visual-language-deviations.md`, following
  the same one-spec-per-deviations-doc pattern as
  `docs/asset-pipeline-deviations.md`/`docs/physics-deviations.md`/etc.
- `PlaceholderSceneRenderer.updateRenderFrame()` now renders through
  `PsxRenderPipeline` instead of calling `renderer.render(scene, camera)`
  directly — the class itself (constructed once by `GameRuntime`) is
  unchanged, preserving the core architecture spec's "exactly one
  renderer/scene/camera" invariant; only what happens inside
  `updateRenderFrame` changed.
