# Physics Deviations

Record deviations from
`plan/threejs_rocket_league_physics_module_spec_v2_1_boost_pads.md`.

## Phase 3 — Physics foundation

- **No second `FixedStepRunner`/accumulator.** The physics spec's own
  section 6.2 `FixedStepRunner` assumes physics is the entire application.
  This project already has a core-architecture-mandated single
  `FixedStepCoordinator` (`src/core/FixedStepCoordinator.ts`, Phase 1)
  that is the one and only fixed-step accumulator, per the core spec's
  explicit rule "never step Rapier from more than one location" /
  "there must be one requestAnimationFrame loop". `PhysicsFacade.step()`
  is a plain single-step method (`world.step()` once) invoked directly
  from `GameRuntime`'s existing fixed-tick callback — there is no second
  accumulator anywhere. Per the Master Brief's specification authority
  order, Core Architecture (#1) supersedes the Physics module (#2) here.
- **Reduced `CarSerializableState`.** The physics spec's section 30.2
  `CarSerializableState` includes `grounded`, `wheelContactCount`,
  `supportNormal`, `boostAmount`, `firstJumpUsed`, `secondJumpAvailable`,
  `dodgeState` — all of these belong to the car controller state machine
  (suspension, boost, jump, dodge), which is Master Brief Phase 5, not
  Phase 3. Phase 3's `CarSerializableState` only has `position`,
  `rotation`, `linearVelocity`, `angularVelocity`, `speed`. The type will
  be extended, not replaced, when Phase 5 lands.
- **`CarInput` is stored but not consumed.** `PhysicsFacade.setCarInput`/
  `clearCarInput`/`clearAllInputs` exist and store per-car input with
  previous/current edge tracking, but no controller reads `currentInput`
  yet to apply forces — cars are currently plain dynamic cuboids with no
  driving behaviour. Ground/air controllers land in Phase 5.
- **`BrowserPhysicsTestApi` is trimmed.** Implements `ready`,
  `pauseRuntime`/`resumeRuntime`, `resetWorld`, `setArenaPreset`,
  `get/setPhysicsParameters`, `spawnCar`/`removeCar`/`getCarIds`,
  `get/setCarState`, `get/setBallState`, `getWorldState`,
  `setCarInput`/`clearCarInput`/`clearAllInputs`, `stepTicks`,
  `getDiagnostics`. The full section 30.1 interface also specifies
  `runInputSequence`/`runScenario` (scenario runner), `startTelemetry`/
  `stopTelemetry`/`clearTelemetry`, `getPhysicsEvents`/
  `clearPhysicsEvents`, boost-pad methods, and `setDebugMode`/
  `setCameraPreset`/`setFocusedCar`. These require systems not yet built
  (a scenario/telemetry recorder, a Rapier collision-event queue and
  canonical `PhysicsEvents`, the boost-pad system — Phase 6 — and a real
  camera/debug-render module — Phase 8). `stepTicks` is implemented;
  `stepSeconds` was omitted as a trivial derivative
  (`stepTicks(Math.round(seconds * RL_CONSTANTS.physicsHz))`) callers can
  compute themselves for now.
- **Arena is physics-owned test geometry, not the asset pipeline's
  stadium.** `src/physics/arena/TestArenaPresets.ts` defines its own
  `TEST_ARENA_DIMENSIONS` (halfWidth 20, halfLength 30, height 20)
  independent of `src/assets/AssetTypes.ts`'s `DEFAULT_STADIUM_DIMENSIONS`
  (fieldWidth 40, fieldLength 60, interiorHeight 20 — i.e. the same
  half-extents, kept numerically consistent on purpose, but as two
  separate constants). Per physics spec section 2.3, a future stadium
  module supplies one `PhysicsArenaDefinition` that both physics and the
  asset pipeline's visual stadium derive from — that unification has not
  happened yet and will land whenever the stadium module (asset spec
  phase 5, roughly Master Brief Phase 14) is implemented. Only `flat-plane`
  and `box-arena` presets exist; `flat-wall`, `quarter-pipe`, and
  `goal-test` from section 13.3 are deferred.
- **No Rapier `EventQueue`.** Car-car and car-ball contacts are currently
  left entirely to Rapier's default solver (as the spec explicitly allows
  for "the first implementation" in section 9) with no custom impulse,
  contact-lifecycle tracking, or canonical `PhysicsEvents`. That is
  Phase 8/9 (car-car / car-ball collision fidelity) work.
- **Debug-only render binding.** `src/integration/PhysicsRenderBinding.ts`
  renders each car as a plain wireframe box and the ball as a plain
  wireframe sphere, added to a `DynamicGameplayRoot` group alongside (not
  replacing) Phase 2's static menu-presentation `PlaceholderWorld`. This
  satisfies the "rendering follows snapshots" exit criterion but is not
  the real gameplay visual — real `CarVisual`/`BallVisual` instances bound
  to physics IDs are expected once match flow (Phase 7) creates actual
  match instances instead of a permanent menu presentation.
- A benign console warning ("using deprecated parameters for the
  initialization function; pass a single object instead") is emitted by
  `@dimforge/rapier3d-compat`'s own internal wasm-bindgen `init()` glue
  code, not by any call in this codebase (`RAPIER.init()` is called with
  no arguments). It does not affect functionality or test results;
  revisit if a `@dimforge/rapier3d-compat` upgrade removes it.
