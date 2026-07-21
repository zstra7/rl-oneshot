# Current Phase

Phase: 8 — Camera and Gameplay HUD
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/camera/ChaseCameraController.ts`: the real gameplay chase camera
  (game-flow spec section 21 / core architecture spec section 64),
  driving the single `THREE.PerspectiveCamera` owned by
  `PlaceholderSceneRenderer` (`getCamera()`, new this phase) rather than
  creating a second camera. Reads only physics render snapshots plus
  match-flow state; never steps or mutates physics.
  - Chase framing: smoothed position/target (frame-rate-independent
    exponential smoothing), velocity-free look-ahead along the car's
    forward vector, distance/height widened as the ball separates from
    the car ("ball framing" / "ball remains visible in normal play").
  - Camera collision: `PhysicsFacade.raycastArena()` (new) casts a ray
    from the look target to the desired camera position, filtered to
    arena colliders only (not cars/ball/boost pads/goal sensors); pulls
    the camera inward on a hit.
  - Ball-camera toggle (Space, edge-tracked by the input module since
    Phase 4): flips a persistent `ballCameraEnabled` flag that biases the
    look target strongly toward the ball.
  - Rear view (held): swaps the chase direction to look back along the
    way the car came, without altering the ball-camera toggle state.
  - Camera swivel: a temporary yaw/pitch offset from `CameraInput.swivelX/Y`
    that eases back to the default framing via the same smoothing used
    for the rest of the rig — no separate "return" logic needed.
  - Menu camera: a slow orbit around the field for the main-menu/match-
    setup/settings presentation, distinct from the live chase camera.
- `GameRuntime.onFixedTick` now samples gameplay input once per tick
  unconditionally (previously only when controls were active) so
  `CameraInput` edges (ball-camera toggle, swivel, rear view) still reach
  the camera controller during countdown/pause, while `CarInput` is still
  gated by `areControlsActive()` as before.
- `GameplayHud`/menu components unchanged in substance from Phase 7 —
  already satisfied "Score/time HUD", "Boost meter", "Countdown overlay",
  and "Pause/results basics" per this phase's exit list; Phase 8 only
  needed to add the camera work around them.
- `window.__GAME_TEST__.runtime.getCameraDiagnostics()`: camera
  position/target/fov/ballCameraEnabled/rearViewHeld, for deterministic
  Playwright verification of "camera does not leave valid space".

## Failing
- None. All Phase 8 exit criteria verified locally in this session.

## Deferred
- Camera shake (spec: Off/Low/Full, default Low, triggered by goals and
  car-ball/car-car impacts) — no canonical impact-event stream exists yet
  (Phase 5/9 territory, see `docs/physics-deviations.md`), and shake
  settings have no persistence system until Phase 15. Not implemented
  this phase; the camera rig is otherwise fully functional without it.
- Full HUD art direction (angular segmented boost meter, display
  typography, glow/scanline treatment) — Phase 13 (PSX visual language)
  and Phase 15 (UI polish) scope; the Phase 7 HUD components already
  satisfy this phase's "HUD is readable" exit criterion as plain,
  legible placeholders.
- Camera settings (FOV/distance/height/stiffness/ball-look-strength/shake
  from the settings spec section 25) are not exposed in the Settings UI
  — no settings persistence exists yet (Phase 15).

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — unchanged at 95/95 (camera logic is
  render-frame/THREE-driven, not meaningfully unit-testable without a
  browser; verified via Playwright instead, per established precedent
  for render-only code).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 35 prior tests still pass, plus a new
  `tests/camera/chase-camera.spec.ts` (3 tests): the menu camera reports
  a sane finite position/fov at boot, the chase camera stays within
  arena bounds and tracks within a normal chase distance of the player
  car while driving with real keyboard input, and Space toggles
  `ballCameraEnabled` through the live input pipeline — 38/38 total on
  `chromium-dev` and `chromium-preview` (test-mode build). Verified
  visually via Playwright screenshots: the menu camera now orbits
  (previously a fixed debug angle), and the live chase camera visibly
  follows the player car from behind during driving.

## Next exact task
- Begin Phase 9 (basic opponent AI) per `plan/MASTER_BUILD_BRIEF.md` and
  `plan/predictive_opponent_ai_module_spec_v1_1_boost_pads.md`, in the
  brief's strict order: ground target driving, recovery, ball
  prediction, reachability, basic intercept, shoot open goal, retreat,
  basic defence, kickoff, boost-pad collection — "one Medium-like
  parameter set" initially, no difficulty tiers yet (Phase 10). Required
  reading before starting: Core Architecture spec (already read) + this
  progress file + the opponent AI module spec. `car-opponent` already
  spawns and receives neutral input only; Phase 9 is the first phase to
  actually call `physics.setCarInput("car-opponent", ...)` with real
  computed input.

## Known deviations
- `ModuleContainer.camera` remains the no-op `NullCameraModule` — the
  real `ChaseCameraController` is wired up as a `GameRuntime`-owned
  integration binding (same pattern as `PhysicsRenderBinding`/
  `BoostPadRenderBinding`), not by replacing this slot's type, because it
  needs the scene renderer's camera object and the ready
  `MatchFlowController`, neither available when `ModuleContainer`
  eagerly constructs its generic slots. See
  `src/camera/NullCameraModule.ts`'s updated doc comment and
  `docs/build-decisions.md` Phase 8 section.
- Camera framing/smoothing constants (`src/camera/CameraConstants.ts`)
  beyond the spec's four explicit numbers (distance 7.5, height 3.2,
  lookAhead 4.5, fov 72) are provisional, first-pass values — the spec
  describes "smoothed position", "ball-aware framing", etc. only
  qualitatively. Revisit during a dedicated camera calibration pass if
  playtesting shows the feel is off.
- Carried over from Phase 1-7: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
