# Current Phase

Phase: 5 — Car Driving and Physics Calibration
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- Full car controller pipeline wired into `PhysicsFacade.step()`, matching
  physics spec section 29's fixed-tick order: per car, before
  `world.step()`: suspension -> jump triggers -> dodge state -> boost ->
  (grounded: ground drive + steering + grip) or (airborne: air throttle +
  aerial rotation); after `world.step()`: speed clamp, jump/flip reset,
  then car-ball extra-hit resolution, then ball speed clamp.
- `SuspensionController` (`src/physics/car/`): four sphere-cast probes
  (`world.castShape`, radius 0.03 m) replacing physical wheels, spring/
  damper impulses at each anchor, `grounded = wheelContactCount >= 3`,
  weighted-average `supportNormal`.
- `GroundDriveController`/`GroundSteeringController`/`GripController`:
  throttle acceleration curve (taper to zero at 14.1 m/s), brake/coast
  mode selection, curvature-based yaw-rate servo steering, upright
  alignment, lateral grip with powerslide blend.
- `BoostController`/`AirborneThrottleController`: consumption (33.3/s),
  ground/air acceleration, airborne throttle acting alongside boost.
- `JumpController`: first jump, held-jump force (0.2 s max, 3-tick
  minimum), 3-tick sticky force, neutral second jump, second-jump window
  (1.25 s) — with a bug found and fixed via ad hoc testing (see Known
  deviations: `hasLeftGroundSinceJump`).
- `AerialController`: local-space pitch/yaw/roll rotation with input-
  reduced damping, converted to/from world space via quaternion rotation,
  angular speed clamped to 5.5 rad/s.
- `DodgeController`: direction from `-pitch`/`yaw` vs. per-car
  `dodgeDeadzone` (default 0.8, now genuinely per-car via
  `CarControlProfile`/`setCarControlProfile`, not global), linear impulse,
  `none -> active -> recovery -> none` state machine.
- `CarBallCollision.resolveCarBallContacts`: per-pair contact-onset
  detection via `world.contactPair()`, the spec's extra-hit-normal
  shaping formula, contact-point velocity (including angular
  contribution), summed across all newly-contacting pairs and applied to
  the ball once per tick, in stable `CarId` order.
- `Vec3Math.ts`: plain-object vector math for the physics module (no
  THREE.js dependency — physics must not import rendering code).
- `CarSerializableState` extended with `forwardSpeed`, `grounded`,
  `wheelContactCount`, `supportNormal`, `boostAmount`, `supersonic`,
  `firstJumpUsed`, `secondJumpAvailable`, `dodgeState`.
- `GameRuntime.onFixedTick` now passes the **real** `grounded` state from
  physics into `sampleGameplayInputForTick` (previously hardcoded `true`
  in Phase 4), and forwards `carControlProfile` via the new
  `physics.setCarControlProfile()`.

## Failing
- None. All Phase 5 exit criteria verified locally in this session.

## Deferred
- Boost pads — Phase 6.
- Full car-car collision fidelity, canonical `PhysicsEvents`, Rapier
  `EventQueue` — Phase 8/9.
- Suspension debug visualisation, dodge rotation-profile refinement,
  full contact-pair separation/re-contact tracking — see
  `docs/physics-deviations.md` Phase 5 section.
- Real playtesting-based calibration of grip/powerslide/aerial/dodge feel
  — the current values are the spec's starting-point preset, unchanged.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 10 files, 67 tests, all passing,
  including a new `carController.spec.ts` (16 tests) that runs the real
  Rapier WASM world directly in Node: settling/grounded state, forward/
  reverse driving reaching expected speed ranges, braking, steering
  curving the heading, boost drain + extra speed, boost floors at zero,
  first jump + held-jump velocity, neutral second jump, dodge (active
  state + forward velocity spike + active->recovery->none timing), jump/
  second-jump reset after landing, aerial rotation with clamped angular
  speed, car speed clamp under sustained throttle+boost, a directional
  car-ball hit, and a 20×60-tick mixed-input stability stress test (two
  cars, boost, powerslide, steering, periodic jump/dodge — no NaN, speed
  always clamped).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright `tests/smoke/**` — 2/2 passing on `chromium-dev` and
  `chromium-preview` (plain production build).
- Playwright `tests/physics/car-driving.spec.ts` (2 tests, new) plus all
  prior suites (`tests/integration/**` 4, `tests/input/**` 10,
  `tests/physics/foundation.spec.ts` 4, `tests/procedural/**` 3) — 25/25
  passing on `chromium-dev` and on `chromium-preview` against a
  `PLAYWRIGHT_TEST=1` test-mode build. The new tests drive the player car
  toward a stationary ball using **real keyboard events** through the
  live input pipeline (not direct `physics.setCarInput`) and confirm the
  ball is knocked away — the literal "one human can hit ball into goal
  area" exit criterion — and exercise jump/boost/dodge via real mouse
  events with no NaN. Verified visually via a Playwright screenshot
  showing the debug car and ball both displaced from their static
  Phase 2 menu-presentation counterparts.
- Fixed one pre-existing Phase 1 test's flakiness
  (`tests/integration/runtime.spec.ts` "fixed tick advances") by
  replacing a fixed 150 ms `waitForTimeout` with `expect.poll` — Phase 5's
  heavier per-tick cost (suspension shape casts etc.) occasionally made
  the fixed wait too short under load.

## Next exact task
- Begin Phase 6 (boost pads) per `plan/MASTER_BUILD_BRIEF.md` and
  `plan/threejs_rocket_league_physics_module_spec_v2_1_boost_pads.md`
  section 21 (boost pad system) plus
  `plan/asset_production_pipeline_module_spec.md` section 42 (boost pad
  visual generation). Required reading before starting: Core Architecture
  spec (already read) + this progress file + physics spec section 21 +
  asset spec section 42 only. Implement: pad definitions (12 small / 4
  full per stadium layout), sensor colliders, deterministic pickup and
  contested-claim resolution, tick-exact respawn timers, collection/
  respawn events, procedural pad visuals (active/inactive/respawning/
  collected-pulse states) reusing the asset pipeline's
  `GeometryRegistry`/`MaterialRegistry`, and kickoff reset to 33 boost +
  all pads active. Do not implement match flow/kickoff sequencing itself
  (Phase 7).

## Known deviations
- See `docs/physics-deviations.md` Phase 5 section for the full list.
  Most notable: a real bug was found and fixed during this phase —
  `hasLeftGroundSinceJump` — where the naive "grounded" jump-reset
  condition from a literal reading of the spec would immediately re-arm
  the first jump on the tick after jumping (because the suspension
  probe's generous `maximumLength` still detects contact for a tick or
  two after a small jump impulse), silently eating the entire second-
  jump/dodge window. Also: simplified car-ball contact-onset tracking
  (no separation-distance re-contact detection), ball-centre-approximated
  contact point, and a simplified dodge rotation profile.
- Carried over from Phase 1-4: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
