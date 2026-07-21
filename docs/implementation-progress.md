# Current Phase

Phase: 1 — Core Runtime and Fixed-Step Loop
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `GameRuntime` (`src/core/GameRuntime.ts`): the single application
  coordinator. Owns the one `requestAnimationFrame` loop, the one
  `FixedStepCoordinator` (120 Hz), a `FrameCoordinator` for render-frame
  consumers, a typed `EventDispatcher<TypedEventMap>`, a `ModuleContainer`
  of null/placeholder modules, and the one `PlaceholderSceneRenderer`
  (Three.js renderer/scene/camera — replaces the Phase 0 inline canvas
  logic).
- `GameRuntimeFactory` singleton (`getGameRuntime()`/`disposeGameRuntime()`)
  and a `useGameRuntime()` composable; `main.ts` disposes it on
  `import.meta.hot.dispose` so HMR cannot duplicate the RAF loop or
  listeners.
- `FixedStepCoordinator` (accumulator, `MAX_FRAME_DELTA=0.25s`,
  `MAX_CATCH_UP_STEPS=8`, spiral-of-death protection) with a `stepOnce()`
  escape hatch for deterministic manual/Playwright stepping that bypasses
  RAF entirely.
- `RuntimeClock`, `FrameCoordinator`, `EventDispatcher`/`EventTypes`
  (`runtime:app-state-changed`, `runtime:fixed-tick`, `runtime:error` —
  extended as later phases' modules land), `ErrorReporter`
  (`DefaultErrorReporter`), `RuntimeDiagnostics`, `ApplicationLifecycle`
  (`classifyStartupFailure`).
- `ModuleContainer` (`src/integration/ModuleContainer.ts`) wired to null
  placeholders: `NullAssetPipeline`, `NullPhysicsModule`, `NullInputModule`,
  `NeutralOpponentAi`, `NullGameFlowController`, `NullStadiumModule`,
  `NullCameraModule`, `NullVfxModule`, `NullAudioModule` (from Phase 0).
- `App.vue`/`GameCanvas.vue` now delegate entirely to `GameRuntime` —
  `GameCanvas.vue` only owns the `<canvas>`, calls
  `initialise()`/`start()`/`dispose()`, and forwards `ResizeObserver`
  events via `runtime.notifyResize()`. `App.vue` subscribes to
  `runtime:app-state-changed` during `<script setup>` (before any child
  `onMounted`) to keep the Pinia `applicationStore` in sync without a race.
- `window.__GAME_TEST__` (`src/testing/TestApiInstaller.ts`,
  `BrowserCombinedTestApi.ts`) installed only under `__DEV__ ||
  __TEST_BUILD__`, exposing `ready()` and a `runtime` sub-API
  (`getAppState`, `getDiagnostics`, `isRunning`, `start`, `stop`,
  `stepFixedTicks`). `physics`/`input`/`ai`/`assets`/`gameFlow` sub-APIs are
  typed as optional and will be filled in as those phases land.

## Failing
- None. All Phase 1 exit criteria verified locally in this session.

## Deferred
- Phase 2 onward: real asset pipeline, physics, input, AI, game flow,
  camera, VFX, stadium, PSX rendering, audio, and their real
  `ModuleContainer` types (currently all typed as the generic `GameModule`
  contract — see Known deviations).
- `RuntimeDiagnostics.matchState` (present in the core spec's diagnostics
  shape) is deferred until the game-flow module (Phase 7) exists; there is
  no match state to report yet.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 4 files, 15 tests, all passing, including:
  - `FixedStepCoordinator` survives 10,000 fixed ticks deterministically
    (steady-60fps simulation) with zero tick-count drift and a bounded
    catch-up-step cap on huge frame deltas (spiral-of-death guard).
  - `EventDispatcher` unsubscribe/dispose/listener-count behaviour (leak
    tests per spec section 53).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes end to end on a plain production build.
- Playwright `tests/smoke/**` — 2/2 passing on both `chromium-dev` and
  `chromium-preview` (against a plain production build).
- Playwright `tests/integration/runtime.spec.ts` — 4/4 passing on
  `chromium-dev`, and on `chromium-preview` against a `PLAYWRIGHT_TEST=1`
  test-mode production build (see Known deviations for why). Covers:
  exactly one `requestAnimationFrame` ever pending at a time; fixed tick
  advances while running and halts immediately after `stop()`; manual
  `stepFixedTicks(10_000)` advances deterministically while stopped and
  the page stays responsive afterward.

## Next exact task
- Begin Phase 2 (asset & procedural foundation) per
  `plan/MASTER_BUILD_BRIEF.md` and
  `plan/asset_production_pipeline_module_spec.md`. Required reading before
  starting: Core Architecture spec (already read) + this progress file +
  the asset pipeline module spec only. Implement the loading manager,
  asset manifest, procedural registries, procedural fallback car,
  procedural ball, a basic stadium blockout, a basic material set, a basic
  star background, and an asset test API — replacing `NullAssetPipeline`
  and `NullStadiumModule` with real (if minimal) implementations, and
  registering real content with the `PlaceholderSceneRenderer` (or its
  Phase 2 successor) instead of an empty scene. Do not begin physics
  (Phase 3) until Phase 2's exit criteria pass.

## Skill update
- The user supplied the real `CloudAI-X/threejs-skills`-equivalent content
  under a top-level `ACTUAL SKILLS TO USE/` folder (pushed directly to this
  branch). All ten project-authored placeholder `.claude/skills/threejs-*/
  SKILL.md` files from Phase 0 were replaced with this real content, and
  the staging folder was removed. `validate:threejs-skills`,
  `type-check`, and `test:unit` were all re-verified green after the swap.
  The "authored locally instead of vendored" deviation noted below no
  longer applies as of this commit — `docs/threejs-skill-usage-log.md`
  should be updated as each skill is actually consulted going forward.

## Known deviations
- `ModuleContainer` (`src/integration/ModuleContainer.ts`) types every
  slot except `audio` as the generic `GameModule` contract rather than the
  richer per-module interfaces shown in core architecture spec section 13
  (`AssetPipeline`, `PhysicsFacade`, `InputControlsModule`,
  `OpponentAiModule`, `MatchFlowController`, `StadiumModule`,
  `CameraModule`, `VfxModule`). Those richer interfaces require reading
  each module's own specification first (per the brief's "read only the
  module required for this phase" rule) — inventing them now would risk
  conflicting with the real specs. Each phase narrows its own slot's type
  when it reads that module's spec.
- The core spec's `ModuleContainer` also lists a `renderer: SceneRenderer`
  slot. Phase 1 instead has `GameRuntime` own a `PlaceholderSceneRenderer`
  directly and register it with the `FrameCoordinator`, rather than routing
  it through `ModuleContainer`, since a real `SceneRenderer` module
  interface does not exist yet. This will likely be reconciled when the
  asset/visual-language phases define the real renderer module.
- `window.__GAME_TEST__` only installs when `__TEST_BUILD__` is true, which
  the literal `test:release` script (plain `npm run build`) does not set.
  See `docs/build-decisions.md` Phase 1 entry for detail and the
  `PLAYWRIGHT_TEST=1` workaround used to verify
  `tests/integration/**` against the preview server in this session.
- Resolved: `.claude/skills/threejs-*` are now the real supplied skill
  content (see Skill update above), not project-authored placeholders.
- See `docs/build-decisions.md` and `docs/integration-deviations.md` for
  the `typescript`/`vitest`/`@types/three`/`@types/node` toolchain version
  deviations (still in effect).
