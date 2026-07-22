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

## Phase 5 — Car driving and physics calibration

- **`CarSerializableState` now extended** (per the Phase 3 note above)
  with `forwardSpeed`, `grounded`, `wheelContactCount`, `supportNormal`,
  `boostAmount`, `supersonic`, `firstJumpUsed`, `secondJumpAvailable`,
  `dodgeState` — matching physics spec section 30.2 except
  `previousInput` (internal only, never serialised) is omitted.
- **Suspension debug visualisation (section 16.6) was not built.** The
  spec says "Do not tune suspension without this visualisation." Given
  Phase 5's "No final visuals yet" scope and time constraints, tuning was
  instead done by asserting on serialized `CarSerializableState` fields
  (`grounded`, `wheelContactCount`, `supportNormal`, velocities) captured
  via ad hoc Vitest runs before writing the final test suite. If future
  calibration proves difficult without a visual, add the suspension debug
  draw described in section 16.6 to `PhysicsRenderBinding`.
- **`hasLeftGroundSinceJump` runtime flag (not in the spec).** The spec's
  section 22 jump-reset logic ("touches ground again") was implemented
  first as "grounded flag is true", which turned out to immediately
  reset `firstJumpUsed`/`secondJumpAvailable` on the very tick after the
  first jump — because the suspension probe's `maximumLength` (0.22 m,
  section 16 calibration value) is generous enough that a single tick's
  jump displacement doesn't clear it, so `grounded` can still read true
  for a tick or two right after liftoff. This silently ate the entire
  second-jump/dodge window. Fixed by tracking `hasLeftGroundSinceJump`
  (true once the car has actually read `grounded === false` at least once
  since the first jump) and only performing the reset once that flag is
  set. Recorded here since it is a deviation from a literal reading of
  "grounded" as the reset trigger, discovered via the ad hoc car-sanity
  Vitest runs described above (worth knowing if suspension
  `maximumLength`/`restLength` are later recalibrated — this interaction
  could resurface).
- **Car-ball extra-hit contact-onset tracking is simplified.** Section
  27.2-27.3's full `ContactPairState` (with `hasSeparatedSinceExtraImpulse`
  / `maximumSeparationSinceHit` for detecting re-contact within one
  continuous overlap) was not implemented. `resolveCarBallContacts`
  (`src/physics/collision/CarBallCollision.ts`) tracks only a per-car
  `wasTouchingLastTick` boolean and applies the extra impulse once on
  each false→true transition (contact onset). This covers the mandatory
  "phase one" cases (single touch, multiple simultaneous cars) but not
  the nuance of a car re-contacting the ball while never fully separating
  in Rapier's narrow phase. Revisit if playtesting shows the ball
  "sticking" without a second hit registering during an extended shove.
- **Car-ball contact point is approximated as the ball centre**, not the
  real witness point from the contact manifold (section 25.5's
  `contactPoint`). `world.contactPair()`'s `TempContactManifold` exposes
  `solverContactPoint`, but the ball-centre approximation was used for
  simplicity — the spec explicitly calls the whole extra-hit curve
  "provisional" and expects calibration.
- **Dodge rotation profile is simplified** relative to section 25.4-25.6.
  The full spec describes driving local pitch/roll angular *velocity*
  toward a dodge profile with flip-cancel and gradual restoration; the
  Phase 5 implementation (`DodgeController.updateDodgeState`) applies a
  constant-rate torque impulse for the `active` duration based on the
  dodge direction, with a simple opposite-pitch-input cancellation term,
  and does not gradually restore ordinary aerial control during
  `recovery` (aerial rotation is simply re-enabled the tick `dodgeState`
  returns to `"none"`). Sufficient for Phase 5's "player can dodge, car
  feels testably stable" exit criterion; revisit during dedicated dodge
  calibration (spec section 25.7's scenario catalogue) in a later pass.
- **`Vec3Math.ts`** — the physics module has its own plain-object vector
  math (no THREE.js dependency), since physics must not import
  rendering/asset code (dependency direction). Quaternion vector rotation
  and axis math are implemented directly rather than via `THREE.Vector3`/
  `THREE.Quaternion`.

## Phase 6 — Boost pads

- **Real bug: boost pad sensor colliders corrupting suspension.** Found
  via ad hoc Vitest debugging when `carController.spec.ts`'s driving
  tests started failing after boost pads were added (car crept backward
  near-zero speed instead of driving forward). Root cause: (1) pad sensor
  cylinders were initially centred at the floor's Y level, so up to half
  their height was buried below the floor and half stuck up through it;
  (2) `world.castShape()` for the suspension probes does not exclude
  sensor colliders by default, so as a car approached/crossed a pad the
  suspension probe would hit the pad sensor geometry instead of (or
  alongside) the floor, corrupting the spring-damper force. Fixed with
  two changes: `SuspensionController`'s `castShape()` call now passes
  `RAPIER.QueryFilterFlags.EXCLUDE_SENSORS`, and
  `createDefaultBoostPadLayout()` positions each pad at
  `floorTopY + halfHeight` so the sensor sits entirely above the floor.
- **Off-by-one tick bug in respawn timing (found and fixed).** The
  original `PhysicsFacade.step()` called
  `boostPadSystem.resolveClaims()`/`processRespawns()` using `this.tick`
  *before* the tick counter's own `this.tick += 1` at the end of the same
  call. Since `collectBoostPadForCar()` (the test-only bypass, called
  between `step()` calls) computes `respawnAtTick` from the *current*
  `this.tick`, this meant a respawn actually required `respawnTicks + 1`
  total `step()` calls to fire — failing the spec's "respawns in exactly
  480/1200 enabled ticks" requirement by one tick. Fixed by moving both
  calls to run *after* the tick increment, so "N ticks after collection"
  consistently means exactly N `step()` calls later for both real
  in-step sensor collection and the test bypass. Verified by the
  exact-480/exact-1200-tick assertions in `tests/unit/boostPads.spec.ts`.
- **Sensor colliders have no parent rigid body.** `BoostPadSystem`
  creates each pad's cylinder collider directly on the world
  (`RAPIER.ColliderDesc...setTranslation(...)`), not attached to a
  kinematic/fixed body, since pads never move — this matches the
  suspension-probe fix above (no body to accidentally collide with) and
  is simpler than the spec's more general sensor-attachment approach.
- **Claim resolution reads car state via `world.intersectionPair()` every
  tick for every (active pad, under-cap car) pair**, rather than
  Rapier's `EventQueue` intersection events. This is O(pads x cars) per
  tick, acceptable at the spec's 16-pad/2-4-car scale; revisit if a
  future phase needs a larger pad count or many more cars.

## Phase 7 — Goal sensors (game-flow spec section 30's "physics owns goal
sensor overlap facts")

- **Goal dimensions kept at the game-flow spec's literal values (14m wide
  / 6m high / 5m deep) even though the field footprint itself was not
  resized to the spec's 72x48.** `TEST_ARENA_DIMENSIONS` (halfWidth 20,
  halfLength 30 — i.e. a 40x60 field) predates Phase 7 and all of Phase
  3-6's calibration (car speed curves, suspension, boost pad layout) was
  tuned against it; resizing the field to 72x48 now would be a
  recalibration exercise out of Phase 7's "functional match flow" scope.
  The goal still fits comfortably (14 < 40 wide, 6 < 20 tall) — see
  `src/physics/goal/GoalTypes.ts`.
- **End walls are no longer a single solid cuboid.** `TestArenaPresets.ts`
  `buildGoalEnd()` replaces each end wall with two goal-post side segments
  plus a header above the goal mouth (leaving the goal opening clear), and
  adds a shallow enclosed "goal box" (back wall, two side walls, roof,
  floor patch) beyond the opening so a scored ball is physically caught
  rather than flying into the void — mirroring how a real Rocket League
  net behaves. This is a genuine geometry change from Phase 3's original
  fully-solid box-arena, not just an addition.
- **A physics-level, sensor-only detection contract**, matching the boost
  pad pattern precedent: `PhysicsFacade` tracks a per-team overlap latch
  (`goalSensorOverlapping`) and only pushes a `GoalScoredEvent` on the
  false->true transition (goal *sensor onset*, not "still overlapping"),
  checked after the tick increment for the same reason as boost pads (see
  Phase 6 section above: "N ticks after X" semantics must use the
  post-increment tick consistently). Physics does not know about match
  state, scoring rules, or the latch needed to prevent double-counting a
  goal across a whole celebration — `MatchFlowController` (game-flow
  spec section 30) owns that.
- **Real bug found via ad hoc Vitest debugging: a single `world.step()`
  immediately after `physics.setBallState()` (teleporting the ball) does
  not yet reflect the new position in `world.intersectionPair()` queries** —
  Rapier's broad-phase/query pipeline for sensor overlaps is only updated
  during `world.step()`'s own internal processing, so the query result
  during the *first* step after a teleport still reflects the pre-teleport
  broad-phase state; only the *second* step's query sees the teleported
  position. This does not affect any gameplay-driven detection (a ball
  that is actually driven/hit into the goal moves gradually and is never
  teleported), but it matters for any test or test-API method that
  teleports the ball directly into a sensor volume and expects one
  `stepTicks(1)` to detect it — `BrowserGameFlowTestApi.simulateGoal()`
  advances two ticks specifically because of this, and
  `tests/unit/goalSensors.spec.ts` always steps well past this window
  (never asserts detection on the exact first tick after a teleport).

## Post-launch polish pass — WS2 (plan/POLISH_OVERHAUL_PLAN.md)

- **Grip/steering tuning bumped well beyond the plan's initial estimate,
  found via ad hoc Vitest debugging.** The plan proposed `grip.normalRate:
  40`, `steering.response: 30` as a starting point; measuring actual yaw
  decay after a turn showed those values barely moved the needle versus
  the original 12/12 (a turn's residual yaw rate only dropped from ~-0.88
  rad/s to ~-0.49 rad/s over 0.6s — nowhere near RL's near-instant grip).
  Root cause: `applyGroundSteering`/`applyLateralGrip` apply their
  "acceleration" parameters as torque/linear **impulses**
  (`impulse = accel * dt`), and Rapier converts an impulse to an angular/
  linear velocity change via the body's actual mass/inertia tensor — so
  the parameter's effective real-world strength is scaled down by an
  implicit, uncalibrated factor baked into the car collider's geometry,
  not a literal rad/s² or m/s². Iteratively increased both constants
  (verified via direct `PhysicsFacade.setPhysicsParameters()` + tick
  logging in a throwaway test) until steering response was genuinely
  snappy: final `grip.normalRate: 90` / `normalMaxAcceleration: 200`,
  `steering.response: 200` / `maximumYawAcceleration: 450`. At these
  values, full-lock steady-state yaw rate converges to within ~1% of the
  curvature-derived target (`maxCurvature(speed) * speed`, the value the
  yaw servo is nominally trying to track) and decays smoothly with no
  overshoot to near-zero within ~0.5s of releasing steer — see
  `tests/unit/drivingFeel.spec.ts`.
- **Test discovery, not a physics bug: a 480-tick (4s) straight-line
  drive test crashes the car into the arena end wall** regardless of
  tuning — `TEST_ARENA_DIMENSIONS.halfLength` is 30m, and the car reaches
  ~14 m/s (no-boost drive speed) well before 4 seconds elapse, covering
  over 50m. Any multi-tick straight-line/top-speed assertion must budget
  its tick count to stay well inside the arena (≤ ~280 ticks / 2.3s for
  this arena size) or it will silently pass or fail based on wall-impact
  behaviour rather than the driving model under test.
- **The AI is now genuinely competent enough (post-WS2 tuning) to reach
  and deflect a repositioned ball, or occasionally score for real during
  a multi-second live-simulation test window** — several Playwright
  tests that scripted a specific player shot or relied on the opponent
  never scoring during a "fast-forward regulation time" window assumed
  the AI was too slow to interfere, which stopped being true once
  steering/grip were fixed and tuned. Fixed by parking the opponent car
  far from the play area (`__PHYSICS_TEST__.setCarState("car-opponent",
  {...})`) in `tests/physics/car-driving.spec.ts`,
  `tests/game-flow/match-flow.spec.ts` (both tests that fast-forward a
  full minute), and `tests/visual-language/stadium-vfx.spec.ts`'s boost
  trail lifecycle test — confirmed via a pure headless
  `PhysicsFacade`-only replay that the player-only driving/shooting
  behaviour itself was never actually broken, only shared with a
  now-more-active AI the test never isolated against.

## Post-launch polish pass — WS3 (plan/POLISH_OVERHAUL_PLAN.md)

- **Rewrote the directional dodge (`DodgeController.ts`) from a torque
  ramp to a kinematic flip**: the previous implementation drove the flip
  via `applyTorqueImpulse` at a fixed rate for a fixed duration, which
  (a) can't guarantee a specific total rotation (torque-impulse-vs-actual-
  inertia mismatch, same class of issue as the WS2 grip/steering finding)
  and (b) never zeroed spin at the end, so the car could land carrying
  residual pitch/roll. Now: the flip axis is computed once at trigger time
  (`normalize(cross(worldUp, dodgeDirectionWorld))`) and `setAngvel()` is
  called directly every active-phase tick at a fixed rate
  (`2π / activeDuration`, so a full dodge always rotates exactly ~360°
  over its 0.65s duration regardless of the car's actual moment of
  inertia), with only the yaw component of angular velocity carried into
  recovery (pitch/roll spin is zeroed) so the car settles flat instead of
  tumbling.
- **The dodge's forward-direction input sign was inverted** — same class
  of bug as the WS1 ground-steering fix.
  `direction.forward = -car.currentInput.pitch` meant holding W in the
  air (nose-down pitch, Rocket League's stick-forward-flips-forward
  convention) triggered a *backward* dodge. Fixed to
  `direction.forward = car.currentInput.pitch` (no negation); pinned by 6
  sign-specific tests in `tests/unit/dodgeFlip.spec.ts` covering forward/
  backward/sideways dodge direction, the resulting flip axis, vertical-
  velocity cancellation at a jump's apex, and flip-cancel. One existing
  test (`tests/unit/carController.spec.ts`, "dodge with directional pitch
  input...") had encoded the old (backward) convention as its expected
  behaviour and needed updating to match the corrected sign — confirmed
  against real Rocket League mechanics before changing it (not just
  "made the test pass").
- **New `dodge.flipCancelBlendSeconds` parameter (0.1s)** replaces the
  removed torque-based `angularAcceleration`/`flipCancelPitchDeceleration`
  parameters, which no longer apply to the kinematic model. Flip-cancel
  (holding pitch opposite the dodge's own forward component) blends the
  flip rate to zero over this window and ends the active phase early,
  rather than fighting a continuous opposing torque.
- **Vertical-velocity cancel added at dodge trigger**: if the car has
  upward velocity when a directional dodge triggers (e.g. dodging near a
  jump's apex), it's zeroed before the dodge's linear impulse is applied
  — this is what makes a Rocket League front-flip/speed-flip hug the
  ground instead of launching the car upward. Not present in the
  original implementation.
- **Test-writing gotcha discovered while pinning "forward flip
  accelerates the car"**: measuring "forward speed" via
  `dot(linearVelocity, car's *current* forward vector)` immediately after
  triggering a flip is meaningless — the car is actively tumbling, so its
  live forward vector no longer points anywhere near its pre-dodge
  heading only a few ticks in. The correct approach (used in
  `dodgeFlip.spec.ts`) is to capture the forward direction *once*, before
  the dodge, and reuse that fixed reference vector for both the
  before/after velocity comparison.

## Post-launch polish pass — WS4 (camera overhaul)

`plan/POLISH_OVERHAUL_PLAN.md` WS4: the chase camera consumed the old
far/high placeholder framing (a leftover from before real car/ball
assets existed) rather than a Rocket-League-accurate rig, had no live
settings, no supersonic FOV kick, and no impact shake.

- **Rig converted to RL's own real-world constants (100uu = 1m)**:
  `CameraConstants.ts` rewritten wholesale — distance 270uu → 2.75m,
  height 110uu → 1.1m, FOV 110° horizontal → 77° vertical at 16:9,
  pitch angle -4°. Verified via `tests/camera/rl-framing.spec.ts`, which
  projects the car/ball into NDC space using `THREE.PerspectiveCamera`
  running under Node (Playwright test files execute in Node, not the
  browser, so `three` can be imported and used directly for this) and
  asserts the car stays pinned bottom-centre in normal cam, both car and
  ball stay framed in ball cam, and the rig never crushes toward the car
  near a wall.
- **`ballLookBias` formula had a latent `||` bug**: an earlier draft used
  `0.3 * (1 - ballLookStrength) || CAM.ballCamCarBias` as a "fallback",
  which incorrectly substitutes the constant whenever the computed value
  is legitimately `0` (i.e. `ballLookStrength === 1`, a fully valid
  settings value). The formula is a complete definition on its own; the
  `||` fallback was removed rather than guarded, since there is no
  invalid input it needs to protect against.
- **`CameraSettings.ts` (new)**: a live-tunable, clamped settings shape
  (`fov`, `distance`, `height`, `stiffness`, `ballLookStrength`,
  `shakeIntensity`, `shakeEnabled`) independent of the settings-store
  schema, following the same `clampCameraSettings()`-with-fallback
  pattern as `validateSettings()`. `GameRuntime` mirrors the existing
  `pendingAudioSettings` pattern with `pendingCameraSettings`, since
  `GameCanvas.vue` applies persisted settings before the camera
  controller (constructed lazily alongside the render pipeline) exists.
- **FOV must apply immediately, not just via the per-frame smoothing
  path**: `updateFov()` is only ever called from `updateChaseCamera()`,
  which never runs while the menu camera (`updateMenuCamera()`) is
  active. A settings-panel FOV change made from the main menu therefore
  had zero visible effect until a match started. Fixed by having
  `applyCameraSettings()` set `camera.fov`/call
  `updateProjectionMatrix()` synchronously, in addition to seeding
  `smoothedFov` for the next live-match smoothing pass.
- **Mid-match settings testing needs a direct runtime hook**:
  `MatchFlowController.openSettings()` only transitions state from a
  `MENU_STATES` match state — it silently no-ops mid-match by design (a
  product decision, not a bug). Tests that need to change camera
  settings while a match is running (e.g. verifying the distance
  multiplier while driving) cannot do it through the settings-panel UI.
  Added `setCameraSettings`/`getCameraSettings` directly to
  `BrowserCombinedTestApi`/`TestApiInstaller` as a dev/test-build-only
  escape hatch, mirroring how `PHYSICS_TEST`/`INPUT_TEST` already bypass
  UI navigation for determinism.
- **Impact shake (WS4.D)**: `updateShake()` diffs ball velocity frame to
  frame (same delta-based pattern as `VfxModule.detectBallImpact`),
  raises `shakeEnergy` when the delta exceeds `shakeVelocityDeltaThreshold`
  and the ball is within `shakeRadius` of the camera's car, and decays it
  exponentially at `shakeDecayRate`. A per-frame random offset (seeded
  `SeededRandom`, not `Math.random()`) scaled by `shakeMaxOffset *
  shakeEnergy` is added to the smoothed camera position after all other
  smoothing, so shake never affects the aim/lookAt target — it reads as
  camera jitter, not a changed view direction. Gated behind
  `settings.shakeEnabled`, which mirrors the separate
  `settings.gameplay.cameraShakeEnabled` settings-store flag (the camera
  controller only accepts one flat `CameraSettings` object, so the
  gameplay-category toggle is folded into it at the two call sites that
  build one: `GameCanvas.vue`'s boot wiring and `SettingsPanel.vue`'s
  `setCameraSlider`/`toggleCameraShake`).
- **Test-writing gotcha: a real collision confounds a shake-jitter
  measurement.** The WS4.D Playwright test (`camera-settings.spec.ts`)
  measures "mean deviation of each sampled camera position from a
  trailing 5-frame moving average" as a proxy for jitter. An early
  version placed the test ball close enough to actually collide with the
  car — the resulting real knockback caused the camera to pan quickly
  chasing the car, which the same moving-average metric flags as
  "high-frequency deviation" just as readily as synthetic shake does,
  producing a false positive even with `shakeEnabled: false`. Fixed by
  keeping the test ball within `shakeRadius` but outside collision range
  of the car, and by pulsing the injected ball velocity with alternating
  sign every ~40ms (rather than one static injection) for the duration
  of the sampling window — a single injected delta decays below
  `shakeDecayRate`'s energy threshold well before a useful number of
  samples can be collected.

## Post-launch polish pass — WS5 (arena overhaul)

`plan/POLISH_OVERHAUL_PLAN.md` WS5: transparent glass shell, enclosed/
unified goals, floor→wall fillets with wall driving, seated boost pads.

- **Goal dimension unification**: `DEFAULT_STADIUM_DIMENSIONS.goalWidth`/
  `goalHeight`/`goalDepth` (assets, purely visual) now import and mirror
  `GOAL_HALF_WIDTH * 2`/`GOAL_HEIGHT`/`GOAL_DEPTH` (physics, authoritative)
  directly rather than duplicating separate literals — previously the
  visual opening was 10m wide while the physics opening was 14m, so cars/
  balls could pass through what visually looked like solid wall.
  `src/assets` importing from `src/physics` is explicitly allowed by
  `scripts/validate-architecture.mjs` (only Vue stores are forbidden).
- **Goal-box seam fix**: `TestArenaPresets.buildGoalEnd`'s goal-box side
  walls/roof colliders are widened by 0.5 in z (their centre shifted to
  match) so they overlap *inside* the end wall's plane instead of
  meeting it edge-to-edge, and the two goal-post wall segments are
  widened 0.25 toward the goal centreline for the same reason.
  Overlapping static colliders are harmless in Rapier; this closes a
  seam a fast-moving ball/car could otherwise phase through. Verified by
  `tests/unit/goalIntegrity.spec.ts` firing the ball at all 8 goal-mouth
  corner/seam combinations for 600 ticks each, asserting it never
  exceeds a small margin outside the arena's physical bounds.
- **Kickoff ball spawn**: `DEFAULT_BALL_SPAWN` changed from
  `{x:0, y:8, z:0}` (falls for ~1.2s at every kickoff) to
  `{x:0, y: RL_CONSTANTS.ballRadius, z:0}` (rests on the floor
  immediately, matching real Rocket League kickoffs).
- **Regression this uncovered**: several existing unit tests
  (`drivingFeel.spec.ts`, `dodgeFlip.spec.ts`, `steeringDirection.spec.ts`,
  `carController.spec.ts`) spawn their test car at the world origin
  `(0, 1, 0)` for convenience. With the ball now resting at the origin
  immediately at world init (rather than still falling from 8m), these
  tests' cars instantly overlapped the ball at tick 0, producing a
  violent collision impulse that sent the car tumbling and made every
  downstream assertion fail (confirmed via a throwaway debug script
  showing `grounded: false` and runaway `angularVelocity` from frame
  one). Real kickoff car spawns (`DEFAULT_CAR_SPAWNS`, at `(±6, 1, ∓10)`)
  never had this problem — only tests using the origin as a convenient
  spawn point did. Fixed by having each affected test's `beforeEach`
  call `physics.setBallState({ position: { x: 15, y: 5, z: 25 } })`
  immediately after spawning the car, parking the ball out of the way
  before settling — the same "park what you don't care about" pattern
  already used for the opponent AI in WS2 (see above).
- **Wall-stick assist must be gated on active throttle.** The plan's
  suggested "small downward pull" (reusing `RL_CONSTANTS.stickyAcceleration`,
  applied whenever `supportNormal.y < 0.7`, mirroring the jump-liftoff
  sticky force in `JumpController.ts`) was first implemented
  unconditionally inside the grounded branch. This produced an
  unbreakable "glue" effect: a car resting motionless on the wall/fillet
  with zero throttle stayed pinned at a constant x offset from the wall
  indefinitely (confirmed via a throwaway debug trace stepping 240 ticks
  and logging position/grounded/supportNormal every 10 ticks — x moved
  by 0.01 units total). Disabling the assist entirely and re-running
  showed the glue was actually coming from two sources: the assist
  impulse itself (pushing the car *into* the surface every tick), and
  separately from the existing lateral-grip model (`GripController.ts`,
  tuned in WS2) treating gravity's wall-parallel component as ordinary
  lateral slip and cancelling it — an idle car on a slope essentially
  never loses grip in this simplified (non-friction-cone) grip model.
  Gating the wall-stick assist on `Math.abs(input.throttle) > 0.05` fixed
  the case the assist actually needs to help (a car actively driving up
  onto a fillet, where losing suspension contact mid-climb from its own
  momentum is the real problem) without making an idle car artificially
  immovable. The residual "idle cars don't slide off vertical walls"
  behaviour is a pre-existing property of the absolute (non-friction-
  cone) lateral grip model, not something WS5.C introduces or attempts
  to fix — `tests/unit/wallDriving.spec.ts`'s third test documents this
  as a numerical-stability check rather than asserting detachment.
- **Fillet collider/visual math**: both the physics fillets
  (`TestArenaPresets.filletColliders`) and the visual quarter-cylinder
  strips (`StadiumGeometryFactory.createWallFillets`) follow the plan's
  arc parametrisation directly — `FILLET_RADIUS = 2.0`, 5 segments per
  run, generalised into one `fillet()` helper parametrised by axis
  (`"x"` for side walls, `"z"` for end walls) and a `sign` (the wall's
  outward-normal sign along that axis) so the same formula covers all
  four wall runs without four near-duplicate blocks. End-wall fillets
  are split into two shorter runs either side of the goal mouth so the
  goal opening stays clear, exactly mirroring the plan's spec.
- **Boost pad seating**: `BoostPadRenderBinding` was placing every pad
  visual at `pad.position` — the *sensor* centre, which sits
  `pickupHalfHeight` above the floor (`BoostPadLayout.ts`) — so every pad
  floated. Changed to seat at `y = 0` (pads are authored floor-relative),
  with a comment for the (currently unused) case of a non-zero floor top.

## Post-launch polish pass — WS7 (gameplay correctness fixes)

- **RL-style kickoff spawns and facing.** `SpawnCarOptions.rotation` and
  `ResetWorldOptions.kickoffVariantIndex` were added so `resetWorld()` can
  place cars at one of 5 RL-style kickoff spots (`KICKOFF_VARIANTS` in
  `PhysicsFacade.ts`), round-robin selected (not random) by
  `MatchFlowController.kickoffCounter`, both cars facing the (centred)
  ball. The facing quaternion is derived, not authored, via
  `V.yawFacing(from, to)`: solved from `applyQuaternion`'s existing
  rotate-about-Y convention (a yaw of `theta` maps local forward
  `(0,0,-1)` to `(-sin(theta), 0, -cos(theta))`), verified against the
  two known reference poses (yaw 0 keeps facing -Z, yaw pi flips to face
  +Z) and against a passing test asserting `dot(carForward, towardBall) >
  0.95` for all 5 variants, both cars.
- **Auto-flip cannot be gated on `!grounded` as the plan's pseudocode
  suggested.** A car resting upside down on the floor still reads
  `grounded: true` with a downward-pointing `supportNormal` within a
  couple of ticks of landing — confirmed via a throwaway Vitest debug
  trace stepping ticks and logging `grounded`/`wheelContactCount`/
  `supportNormal`. The suspension probes rotate with the body and don't
  distinguish "wheels down" from "roof down" for this symmetric car
  collider. `applyAutoFlipIfStranded` (`PhysicsFacade.ts`) instead relies
  only on `up.y < -0.35` plus linear/angular speed gates — `up.y` this
  negative already excludes every normal driving/aerial orientation, so
  the speed gates alone are enough to avoid misfiring mid-dodge or
  mid-recovery. This is a deliberate product deviation from real Rocket
  League, which has no auto-flip (players dodge out themselves),
  requested for this game.
- **Kickoff-rotation regression in unrelated tests.** Several existing
  tests implicitly assumed every kickoff-spawned car always faces -Z
  (true before this change, no longer true with variant-dependent
  facing): `tests/physics/car-driving.spec.ts`'s "driving forward" test
  and `tests/camera/camera-settings.spec.ts`'s supersonic-FOV test both
  repositioned a car via `setCarState({ position })` without also
  resetting `rotation`, so the car's actual (now non-identity) facing
  fought the test's injected velocity via lateral grip. Fixed by
  explicitly resetting `rotation: { x: 0, y: 0, z: 0, w: 1 }` alongside
  the position override in both. The supersonic-FOV test needed this
  reset on *every* iteration of its multi-second velocity-sustaining
  loop, not just once up front: WS7.A's farther-from-centre kickoff
  spawns mean the car can reach and bounce off the back wall several
  times within the test's window, re-spinning it off its -Z heading via
  lateral grip and intermittently dropping it out of supersonic mid-poll
  (observed as ~3/8 flaky failures before the fix, still ~4/15 flaky
  after adding just the per-cycle rotation reset). Fully fixed by also
  re-pinning `position` to the open arena centre `(0, 1, 0)` every cycle
  (so the car never travels far enough to reach a wall at all) and
  parking the ball away from that point first (so the repeated position
  reset can't collide with it) — 15/15 stable afterward.
- **VFX boost-trail test timing, twice-over.** New kickoff spots sit
  farther from the arena centre than the old fixed pose, which shifted
  when a player's drive-and-hit-the-ball VFX burst lands in real time
  relative to a Playwright test's fixed `waitForTimeout` calls, in two
  different directions: `stadium-vfx.spec.ts`'s "boosting spawns..."
  test's *before*-count assertion started seeing the opponent AI's own
  boost trail (still decaying from countdown-window activity) — fixed by
  parking the opponent before `advanceGameTicks(460)` runs, not after;
  the same test's *after*-settling assertion started seeing a
  late-arriving ball-impact burst that hadn't fully decayed by a fixed
  1500ms wait — fixed by replacing that fixed wait with
  `expect.poll(...).toBe(0)` so a late burst still gets time to decay
  before the assertion runs.

## Post-launch polish pass — R1 (arena ramps v2, plan/RAMPS_AND_FEATURES_PLAN.md)

Replaced the divergent physics-only `fillet()` (`TestArenaPresets.ts`) and
visual-only `createWallFillets()` (`StadiumGeometryFactory.ts`) with one
shared generator, `src/physics/arena/ArenaRampGeometry.ts`, consumed
identically by both — eliminates the whole "physics and visuals disagree"
bug class, root-caused as follows:

- **Mid-field drive-through ghost ramp.** The old right side-wall visual
  fillet used `rotation.set(Math.PI/2, 0, Math.PI/2)`. Under three.js
  Euler XYZ composition (R = Rx·Ry·Rz) that maps the cylinder's 60m
  length axis onto world **X**, not Z, laying the quarter-pipe tube
  across the middle of the field at `(18, 2, 0)` — with no matching
  physics collider (the physics side was already correct for that wall),
  so it was purely a drive-through visual artifact.
- **Invisible side ramps.** The old left fillet mesh was an open-ended
  `CylinderGeometry` whose outward faces pointed away from the arc centre
  — viewed from inside the arena you saw the concave (back, culled) side
  of a default `FrontSide` material, and post-WS8 that material was also
  the near-black unmapped floor base, so even a stray backface fragment
  would have read as "really dark".
- **Goal-side ramps backwards + broken physics.** Visually, the old end
  fillet's `rotation.set(0, 0, Math.PI/2)` swept the arc into the wrong
  quadrant (floating above the intended position, curving the wrong
  way). Physically, `fillet()`'s `axis === "z"` branch reused
  `quatAxisX(sign * theta)` for both end walls — tipping the surface
  normal **into the wall** on both runs (the correct sign for the
  `axis === "z"` case is `quatAxisX(-sign * theta)`), so cars nosed into
  segment edges and stopped dead: "I just drive straight into the wall."
- **No corners at all.** The four wall-wall junctions were square, with
  full-length fillet runs simply interpenetrating at right angles.

**New generator design.** `filletRun(wallBase, inward, runHalfLength)`
derives its run axis as `inward` rotated 90° (`runDir = (inward.z, 0,
-inward.x)`), then tilts the template box about that *world-space* axis
by the arc angle. This is a single formula whose surface-normal sign is
automatically correct for every wall (proved as a general property: the
horizontal component of the tilted normal always works out to `inward *
sin(theta)`, i.e. always non-negative-into-the-field, independent of
which wall or corner panel it's computed for — no more per-wall sign
case to get wrong). The right-wall case reduces exactly to the old
(already-correct) collider values, used as the anchor regression test.
Curved corners (`CORNER_RADIUS = 6.0`, 6 panels × 15° each) chamfer each
rectangular corner with the same `filletRun` helper plus a glass-material
vertical wall panel per segment; straight walls/end-run segments are
shortened to meet the corners exactly at their arc endpoints (verified
by a "no gaps" coverage test sampling stations along every wall/corner
base line).

**Visual side**: ramps use the floor's own concrete texture (falling back
to a light flat grey, `0x8a929e` — never the near-black floor-base
colour) so they read "as visible as the floor" per the request; corner
wall panels reuse the transparent glass-shell material so the arena
stays visually consistent. Straight glass side/end walls are shortened by
`CORNER_RADIUS` on each end to meet the corner panels without an
overlapping double-alpha transparency seam. Structural ribs are confined
to the straight run between corners (`|z| ≤ halfLength - CORNER_RADIUS`)
so none floats inside a corner arc.

**Bugs found and fixed along the way, unrelated to the ramp geometry
itself but surfaced by writing real tests against it:**

- **`PhysicsFacade.raycastArena` always returned `null`**, unconditionally,
  for every call — a pre-existing bug, never caught before because no
  other code path or test ever exercised this method (camera collision
  avoidance uses a height clamp instead, not a raycast). Root cause:
  `Collider.parent()` in `@dimforge/rapier3d-compat` constructs a *fresh*
  `RigidBody` wrapper object on every call, so
  `arenaBodies.includes(collider.parent())` (reference-equality
  `Array.includes`) never matched, even for an arena collider's own
  body — the ray-cast filter predicate rejected every collider
  unconditionally. Fixed by comparing `RigidBody.handle` (a stable
  numeric id) instead of object identity. Found and fixed via the new
  "raycast closure sweep" test (`wallDriving.spec.ts`), which is also a
  reminder that **Rapier's spatial-query broad-phase structures are only
  built during `world.step()`** — a freshly-initialised, never-stepped
  world reports no hits at all even for colliders created before the
  first step; the closure-sweep test steps once before raycasting.
- **`aiUnstuck.spec.ts`'s wall-pin regression test became chaos-sensitive
  to unrelated collider additions.** Adding the 24 corner-wall colliders
  (positioned nowhere near that test's spawn/escape path, geometrically
  verified clear) still perturbed the exact floating-point evolution of
  a long (10s), chaotic AI simulation enough to land the rolling
  stuck-window scan on a different — and unrelated — "car idling near
  the stationary ball in open field" moment several seconds after the
  actual wall-escape the test is meant to verify. Fixed by restricting
  the rolling-window scan to windows starting near the wall (matching
  the test's own stated purpose), rather than loosening the movement
  threshold.
- **New end-wall wall-climb unit tests needed a shorter duration (260
  vs. the side-wall test's 360 ticks).** The end runs are narrower and,
  empirically, sustained throttle+boost carries the car up past the
  ~2m fillet and all the way up the flat 20m vertical wall to the
  ceiling within 360 ticks, whose unrelated ceiling-contact impulse
  spike is not what those tests are verifying (fillet-climb smoothness).

## Post-launch polish pass — R3 (auto-flip v2, `PhysicsFacade.ts`)

The original auto-flip (WS7.B) only handled "upside down and fully
stopped." Two problems reported: (1) it didn't catch a car stranded on
its side or standing on its nose/tail, and (2) any throttle-based or
speed-based gating risked either never triggering for a slow drift, or
— worse — misfiring while the player was legitimately still driving up
a wall/ramp (a car climbing a fillet is tilted and slow near the top).

**Fix — a contact-based predicate, not a pose/input heuristic.** A car
is "stranded" only when it is *not* resting on a driveable surface:
`!(car.runtime.grounded && car.runtime.supportNormal.y > 0.05)`. This
reuses the same per-tick suspension-probe contact state the wheel/drive
code already computes, so a car climbing a wall or ramp — whose contact
normal necessarily has some `y` component from the fillet geometry, or
whose wheels are in contact with a shallower-than-horizontal but still
"floor-like" surface — is correctly exempt for as long as it's actually
touching that surface, regardless of throttle input. Releasing input
mid-climb (coasting) does not end the exemption, because the exemption
was never input-gated to begin with. Combined with the existing
`up.y < 0.55`, `height < 1.2m`, low linear/angular speed thresholds and
a 0.75s sustained-stranded timer (`invertedSeconds`), this fires for
upside-down, on-side, nose-stand, and tail-stand poses alike — any
orientation where `up.y` is low, not just the upside-down case — while
never triggering for a car that's touching any surface with a
meaningfully upward-facing normal.

Widened thresholds from the original: `AUTO_FLIP_SPEED_THRESHOLD` 6.0
(was gated differently before), `AUTO_FLIP_ANGULAR_SPEED_THRESHOLD` 4.0,
so a slow drift while stranded still counts as "roughly stationary" and
gets righted, matching the "auto-flip should work while drifting"
requirement.

New tests in `tests/unit/autoFlip.spec.ts` cover side/nose/tail-stand
righting (including that horizontal drift is preserved at the instant
of righting, before tire friction on the new grounded orientation
legitimately bleeds it off over subsequent ticks — not a bug), a raised
non-flip speed threshold check, and two dedicated regression tests
proving the contact-based exemption never misfires: climbing a wall
fillet under sustained throttle, and coasting (input released) partway
up a ramp climb — both assert no single-tick `up.y` jump from below 0.7
to above 0.99 (the signature of a teleport-righting) across 300 ticks.

## Post-launch polish pass — R5 (camera steady through flips, `ChaseCameraController.ts`)

**Root cause:** the normal-cam branch of `updateChaseCamera` recomputed
the chase direction every frame from the car's flattened forward vector.
During a dodge the body tumbles: the flattened forward swings wildly
(diagonal/side flips) or degenerates through vertical (front/back flips,
only caught by the pre-existing `lengthSq < 0.01` fallback). The result
was a visible camera whip mid-flip that "corrects" once the car lands —
real Rocket League's camera holds its line through a dodge instead
(ball cam is unaffected, since its direction is derived from car↔ball
positions, not the car's own orientation).

**Fix:** while `playerCar.dodgeState !== "none"` (and only in the
non-ball-cam branch), the chase direction is pinned to whatever yaw was
already smoothed when the dodge began (`dodgeYawHold`), instead of being
re-derived from the tumbling forward vector each frame. The hold clears
back to `null` the instant the dodge ends, so normal smoothing
seamlessly picks the car's actual heading back up — matching the
"camera holds through the flip, catches up after" feel. `updateFov` was
refactored to take the already-fetched `playerCar` state as a parameter
instead of re-fetching it, since `updateChaseCamera` now needs that
state earlier for the dodge check anyway.

New unit test `tests/unit/cameraFlipYaw.spec.ts` constructs a real
`ChaseCameraController` against a real `PhysicsFacade` (a `THREE.
PerspectiveCamera` plus a `{ getMatchState: () => "PLAYING" }` game-flow
stub is enough — the controller only reads camera/physics/match-state,
never mutates physics), drives to a settled yaw, triggers a real
diagonal dodge through the same jump→jump-with-pitch/yaw input sequence
`dodgeFlip.spec.ts` uses, and asserts the camera's yaw (derived from its
diagnostics target/position, i.e. what it's actually looking at) never
drifts more than ~3.4° from the pre-dodge yaw while `dodgeState !==
"none"`. Verified meaningful by temporarily reverting the fix and
confirming the test fails with a ~360° (6.28 rad) swing — the full whip
the fix eliminates. A second test confirms ball-cam behaviour is
unaffected (no NaN, camera stays finite) through the same dodge.

## Post-launch polish pass — R6 (goal-scored blast force, plan/RAMPS_AND_FEATURES_PLAN.md)

Real Rocket League throws cars near the scored-on goal mouth away in a
small shockwave when a goal is scored — purely a feel/spectacle beat,
absent before this pass. `PhysicsFacade.applyRadialCarImpulse(centre,
radius, maxDeltaV)` applies a mass-scaled impulse to every car within
`radius` of `centre`, with linear falloff by distance and a fixed 0.35
upward component (so cars get thrown up and out, not just sideways);
cars beyond `radius` are untouched. `MatchFlowController.processGoal`
calls it once per goal, before the score/state transitions, centred on
`getGoalSensorCentre(otherTeam(scoringTeam))` (the goal that was scored
on) with `GOAL_BLAST_RADIUS = 16`, `GOAL_BLAST_MAX_DELTA_V = 18`. Physics
owns the impulse math; game-flow only decides *when* to fire it — the
same "physics is the source of truth for anything physical" split used
throughout this project.

New tests in `tests/unit/goalBlast.spec.ts` cover the physics method in
isolation (nearby car gets thrown away from centre with a positive
vertical component; a car outside the radius is essentially untouched)
and the full match-flow integration (a car parked at the scored-on goal
gets kicked while a midfield car is unaffected; exactly one impulse
fires per goal — no repeated kicks while the goal-celebration state is
latched, verified by asserting speed only ever decays after the initial
kick, never spikes back up). A Playwright test in `tests/game-flow/
match-flow.spec.ts` exercises the same path end-to-end through
`simulateGoal`. `getGoalSensorCentre` was also added to
`BrowserPhysicsTestApi`/`__PHYSICS_TEST__` (it already existed on
`PhysicsFacade` as a test-only accessor) so the Playwright test can
locate the goal mouth without hardcoding arena coordinates.
