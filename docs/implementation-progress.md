# Current Phase

Phase: 3 — Physics Foundation
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `PhysicsFacade` (`src/physics/PhysicsFacade.ts`) replaces the old
  `NullPhysicsModule` as the real `physics` module slot. Owns one Rapier
  `World` (gravity `-6.5 m/s²`, fixed timestep `1/120`), a `CarRegistry`
  (stable insertion-order, duplicate-ID rejection), one ball rigid body,
  and fixed/box-arena colliders built from `TestArenaPresets.ts`.
- `PhysicsConstants.ts`/`PhysicsParameters.ts` transcribed from the
  physics spec sections 7.1/7.2 (measured constants vs. the tunable
  `PhysicsParameters` typed registry + `DEFAULT_PHYSICS_PARAMETERS`
  preset) — only `carWorld`/`ballWorld` are actually applied to colliders
  yet; the rest await Phase 5's controllers.
- Cars are plain dynamic cuboids (`CAR_HALF_EXTENTS`/`CAR_HITBOX_OFFSET`
  from spec section 11.1) with CCD enabled, sleep disabled — no driving
  controller yet (Phase 5). `CarInput` is typed, stored per-car with
  edge-tracking (`currentInput`/`previousInput`), but unconsumed.
- Ball is a dynamic sphere (`ballRadius = 0.9125`, mass 30, restitution
  0.6) with CCD enabled.
- **Single Rapier step location**: `GameRuntime`'s existing
  `FixedStepCoordinator` (Phase 1) calls `physics.step()` directly inside
  its one fixed-tick callback — no second accumulator was introduced (see
  Known deviations for why this differs from the physics spec's own
  standalone `FixedStepRunner`).
- Render-snapshot interpolation: `PhysicsFacade.getRenderSnapshot(alpha)`
  lerps/nlerps between the previous and current tick's transforms per
  car/ball. `PhysicsRenderBinding` (`src/integration/PhysicsRenderBinding.ts`)
  is a debug-only render-frame consumer (wireframe box per car, wireframe
  sphere for the ball) proving the render-follows-snapshot wiring end to
  end — verified visually via a Playwright screenshot.
- `window.__PHYSICS_TEST__` (`BrowserPhysicsTestApi`) installed under
  `__DEV__ || __TEST_BUILD__`: `ready`, `pauseRuntime`/`resumeRuntime`,
  `resetWorld`, `setArenaPreset`, `get/setPhysicsParameters`,
  `spawnCar`/`removeCar`/`getCarIds`, `get/setCarState`, `get/setBallState`,
  `getWorldState`, `setCarInput`/`clearCarInput`/`clearAllInputs`,
  `stepTicks`, `getDiagnostics`.
- `GameRuntime.initialise()` spawns `car-player`/`car-opponent` at boot so
  there is always something to test/observe; `resetWorld({carCreationOrder})`
  supports respawning them in a different order for order-independence
  tests.

## Failing
- None. All Phase 3 exit criteria verified locally in this session.

## Deferred
- Car ground/air controllers (suspension, drive, steering, grip, boost,
  jump, dodge) — Phase 5.
- Boost pads — Phase 6.
- Rapier collision `EventQueue`, canonical `PhysicsEvents`, custom
  car-ball/car-car impulse response, contact-lifecycle tracking — Phase
  8/9 (car-car/car-ball collision fidelity).
- Scenario runner, telemetry recording — Phase 5 calibration workflow.
- Real stadium arena (curved transitions, goals) shared between physics
  and the asset pipeline's visual stadium — Phase 14 (or whenever the
  stadium module unifies both).

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 8 files, 42 tests, all passing, including
  a new `physicsFacade.spec.ts` (14 tests) that runs the real Rapier WASM
  world directly in Node/Vitest:
  - Two cars + a ball spawn with finite (non-NaN) state; duplicate CarIds
    are rejected.
  - The ball falls under gravity and bounces off the floor without
    tunnelling (never goes below `y ≈ 0`, shows upward velocity after
    contact).
  - No NaN over a 1200-tick (10s) run with two cars and a ball active.
  - Ball and car speeds are clamped to `RL_CONSTANTS.ballMaxSpeed`/
    `carMaxSpeed` after an artificially huge injected velocity.
  - Two cars collide and separate rather than passing through each other;
    both cars can contact the ball in the same run without losing either
    entity or producing NaN.
  - `resetWorld()` replayed twice with identical setup produces a
    byte-identical ball-height trajectory (determinism); car creation
    order is independently controllable.
  - `stepTicks()` advances the tick counter exactly; `getRenderSnapshot()`
    correctly interpolates between ticks.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build (Rapier's WASM chunk builds cleanly
  alongside `three`/`vue`).
- Playwright `tests/smoke/**` — 2/2 passing on `chromium-dev` and
  `chromium-preview` (plain production build).
- Playwright `tests/physics/foundation.spec.ts` (4 tests, new) plus the
  existing `tests/integration/**` (4) and `tests/procedural/**` (3) — 11/11
  passing on `chromium-dev`, and on `chromium-preview` against a
  `PLAYWRIGHT_TEST=1` test-mode build (same caveat as Phases 1-2). Physics
  browser tests verify: two cars + ball exist at boot with finite state;
  `stepTicks(120)` advances the tick counter by exactly 120 once the live
  RAF loop is paused via `pauseRuntime()`; `resetWorld()` is repeatable
  across two runs; the ball visibly falls and settles above the floor.

## Next exact task
- Begin Phase 4 (input foundation) per `plan/MASTER_BUILD_BRIEF.md` and
  `plan/input_controls_module_spec.md`. Required reading before starting:
  Core Architecture spec (already read) + this progress file + the input
  module spec only. Implement keyboard/mouse raw state, a gamepad virtual
  provider, default mappings, logical actions, an edge queue, input
  contexts, and an input test API — replacing `NullInputModule`. Do not
  wire input to car driving forces yet (that is Phase 5, which also reads
  the physics module's controller sections 15-25 that Phase 3
  deliberately skipped).

## Known deviations
- See `docs/physics-deviations.md` (new) for the full list, most notably:
  no second `FixedStepRunner` (core's single `FixedStepCoordinator` drives
  physics directly — Core Architecture is specification authority #1 and
  explicitly forbids stepping Rapier from more than one location), a
  reduced `CarSerializableState` (controller-state fields deferred to
  Phase 5), a trimmed `BrowserPhysicsTestApi`, and a physics-owned test
  arena kept numerically consistent with but structurally separate from
  the asset pipeline's `DEFAULT_STADIUM_DIMENSIONS` until a real stadium
  module unifies both.
- `PLACEHOLDER_PHYSICS_METADATA` in `src/assets/AssetTypes.ts` (flagged as
  a to-be-replaced placeholder in the Phase 2 progress notes) was
  deliberately left as-is rather than wired to the new
  `PhysicsFacade`/`RL_CONSTANTS`, since assets must not import physics
  (dependency direction, core spec section 10) — the eventual fix is a
  shared stadium/physics-metadata source both modules read from, not a
  direct cross-import; tracked in `docs/asset-pipeline-deviations.md`.
- A benign `@dimforge/rapier3d-compat`-internal console warning is
  observed at boot; see `docs/physics-deviations.md` for detail.
- Carried over from Phase 1/2: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__` only install when `__TEST_BUILD__` is true, which
  the literal `test:release` script (plain `npm run build`) does not set
  — see `docs/build-decisions.md`.
