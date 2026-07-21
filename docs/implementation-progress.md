# Current Phase

Phase: 4 — Input Foundation
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `InputControlsModule` (`src/input/InputControlsModule.ts`) replaces
  `NullInputModule` as the real `input` module slot. Not typed as
  `GameModule` — its `initialise()` needs the canvas element, so
  `GameRuntime` initialises it explicitly (context `"GAMEPLAY"` by
  default, since no menu/match-flow context switching exists yet —
  Phase 7) rather than through the generic zero-argument module loop.
- `KeyboardState`/`MouseState` (`src/input/KeyboardState.ts`,
  `MouseState.ts`): raw held-key/held-button tracking, `repeat`-event
  filtering, browser-default suppression (Space/Tab/arrows, RMB context
  menu, MMB autoscroll) gated to `GAMEPLAY` context and non-editable
  targets only (input spec section 7.3).
- Rocket-League-style default bindings (`src/input/bindings/DefaultBindings.ts`):
  WASD ground/air dual-purpose keys, LMB boost / RMB jump / MMB rear-view,
  Space ball-camera, Tab scoreboard, Escape pause, and the full standard
  Gamepad API mapping with the modern default preset (RT accelerate / LT
  reverse+air-roll-modifier / A jump / B boost / X powerslide / Y
  ball-camera / LB scoreboard / Start pause).
- `LogicalGameplayState`/`buildCarInput` (`src/input/LogicalGameplayState.ts`):
  the exact ground/air `CarInput` resolution algorithm from physics spec
  section 27, including air-roll-modifier vs. explicit air-roll-left/right
  priority — covered by 9 pure-logic Vitest unit tests.
- `GamepadProvider` dependency-injection pattern (input spec section 42):
  `BrowserGamepadProvider` (production, wraps `navigator.getGamepads()`)
  and `VirtualGamepadProvider` (deterministic test double), both
  implementing the same interface so virtual input flows through the
  identical processing pipeline as real gamepads.
- Edge queue (`ActionEdge[]`) for `JUMP`/`BALL_CAMERA`/`PAUSE`: one
  physical press produces exactly one consumable logical press edge;
  `sampleGameplayInputForTick` consumes it once, so repeated fixed-tick
  samples in the same browser frame never see a duplicate press (verified
  by Playwright: "Right mouse button produces a jump press edge exactly
  once", same for Space/Escape).
- Focus-loss safety (input spec section 37): `window.blur` and
  `document.visibilitychange` (hidden) both clear keyboard/mouse held
  state and pending edges, neutralising gameplay input immediately —
  verified by Playwright.
- Device switching: any meaningful keyboard/mouse press sets
  `activeDevice = "keyboard-mouse"`; any gamepad button edge sets
  `activeDevice = "gamepad"`. Gamepad disconnect clears the assignment and
  neutralises input — verified by Playwright (virtual gamepad
  connect/state/disconnect test).
- `window.__INPUT_TEST__` (`BrowserInputTestApi`) installed under
  `__DEV__ || __TEST_BUILD__`: `ready`, `reset`, `setContext`/`getContext`,
  `injectKeyboardEvent`/`injectMouseEvent` (dispatch real DOM events on
  the same listener targets production code uses), `connectVirtualGamepad`/
  `disconnectVirtualGamepad`/`setVirtualGamepadState`, `assignGamepad`,
  `getActiveDevice`, `sampleTick` (polls the gamepad provider then samples
  — works even while the runtime's RAF loop is paused), `simulateBlur`,
  `getDiagnostics`.
- `GameRuntime` wiring: `updateBrowserFrame()` is called once per RAF
  frame (core architecture spec section 23 frame-loop order), and
  `sampleGameplayInputForTick()` is called once per fixed tick — inside
  the same `onFixedTick` callback that steps physics — with the resulting
  `CarInput` handed to `physics.setCarInput("car-player", frame.car)`.
  `grounded: true` is a placeholder until Phase 5's suspension/ground
  detection exists (physics still doesn't consume `CarInput` at all yet —
  see Phase 3's deviations note, unchanged).

## Failing
- None. All Phase 4 exit criteria verified locally in this session.

## Deferred
- Rebinding UI/flow, binding persistence — Phase 15.
- Full analogue sensitivity calibration, haptics, camera-swivel
  consumption, UI navigation repeat/prompt icons, input telemetry — see
  `docs/input-calibration-log.md` "Deferred to later phases" for the
  complete list mapped to input spec section numbers.
- Ground/air car controller actually consuming `CarInput` — Phase 5.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 9 files, 51 tests, all passing, including
  a new `carInputResolution.spec.ts` (9 tests) covering every branch of
  `buildCarInput` (grounded throttle/steer, airborne pitch/yaw, air-roll
  modifier vs. explicit air-roll-left/right priority, powerslide only
  while grounded, jump/boost pass-through).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright `tests/smoke/**` — 2/2 passing on `chromium-dev` and
  `chromium-preview` (plain production build).
- Playwright `tests/input/foundation.spec.ts` (10 tests, new) plus the
  existing `tests/integration/**` (4), `tests/physics/**` (4), and
  `tests/procedural/**` (3) — 21/21 (23 total with smoke) passing on
  `chromium-dev` and on `chromium-preview` against a `PLAYWRIGHT_TEST=1`
  test-mode build (same caveat as prior phases). Input tests verify: W /
  W+D / S keyboard driving; LMB boost; RMB jump edge consumed exactly
  once; Space/Escape edges consumed exactly once; airborne WASD resolves
  to pitch/yaw; focus loss neutralises held input; virtual gamepad
  connect -> drives throttle via right trigger -> disconnect neutralises.

## Next exact task
- Begin Phase 5 (car driving and physics calibration) per
  `plan/MASTER_BUILD_BRIEF.md` and
  `plan/threejs_rocket_league_physics_module_spec_v2_1_boost_pads.md`
  sections 15-25 (per-car state machine, suspension/ground detection,
  ground drive, steering, grip/powerslide, boost, jumping, airborne
  throttle, aerial rotation, dodge/flip). Required reading before
  starting: Core Architecture spec (already read) + this progress file +
  the physics module spec's car-controller sections (do not re-read
  sections already covered in Phase 3). Wire the real `grounded` state
  from suspension probes into the `GameplayInputContext` passed to
  `sampleGameplayInputForTick` (currently hardcoded `true` in
  `GameRuntime.onFixedTick`), and have the car controller actually
  consume `CarEntity.currentInput` to apply forces. Do not implement
  boost pads yet (Phase 6).

## Known deviations
- Input's `CarInput`/`CameraInput`/`SystemInputFrame`/`UiInputFrame` types
  (`src/input/InputTypes.ts`) are structurally identical to, but not
  imported from, the physics module's equivalents — input must not import
  physics (dependency direction, core architecture spec section 10;
  `validate-architecture.mjs` forbids `src/input/** -> @/physics/**`).
  `GameRuntime` (integration layer) bridges the two structurally: passing
  an `input.CarInput`-shaped object directly to
  `physics.setCarInput(id, partial)` works with zero explicit conversion
  because both interfaces have identical field shapes by design.
- `BrowserInputTestApi` is trimmed to what Phase 4 implements (see
  `src/input/testing/BrowserInputTestApi.ts` doc comment) — rebinding,
  settings, and haptic-log methods from input spec section 41 are
  deferred to Phase 15.
- `InputControlsModule` deliberately does **not** implement the
  `GameModule` interface (see its class doc comment) because
  `initialise()` requires the canvas element as an argument, which the
  core architecture spec's generic zero-argument `GameModule.initialise()`
  module-container loop cannot supply. `ModuleContainer.input` is typed as
  the concrete `InputControlsModule` instead, and `GameRuntime` calls its
  `initialise()` explicitly, outside that loop. `dispose()` still matches
  the common zero-argument shape and participates in the generic dispose
  pass.
- Air-roll-left/right have no default binding (per spec, intentionally
  unbound) — there is currently no rebinding UI to bind them, so that code
  path is exercised only by the unit tests, not reachable via default
  input yet.
- Carried over from Phase 1-3: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot; see `docs/physics-deviations.md`.
