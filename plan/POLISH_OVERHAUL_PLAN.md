# POLISH_OVERHAUL_PLAN.md — Space Carball Feel & Polish Overhaul

This is a **one-shot implementation plan**. It supersedes nothing — all prior specs and
`docs/*` conventions remain in force. It is written to be executed top-to-bottom by a
Sonnet-class model with no further human clarification. Every workstream states the
problem, the verified root cause (with file/line references that are correct as of the
commit this plan was written on), the exact change to make, and the tests that gate it.

**Read this entire document before writing any code.** Several workstreams interact
(steering sign → AI; camera → wall transparency; fillets → wall driving), and the
ordering below is deliberate.

---

## 0. Ground rules, environment, and workflow

### 0.1 Environment facts (do not rediscover these the hard way)

- Playwright needs the pre-installed browser: **always** run Playwright with
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` in the environment. Without it,
  every test fails with "Executable doesn't exist … chrome-headless-shell".
- The Playwright config boots its own dev/preview servers, but the **preview** server
  serves whatever is in `dist/`. Before running any Playwright suite that uses
  `chromium-preview`, rebuild with the test flag: `PLAYWRIGHT_TEST=1 npx vite build`.
  (A plain build omits `window.__GAME_TEST__` and most suites will fail.)
- `tests/release/release-gate.spec.ts` is the opposite: it MUST run against a **plain**
  `npx vite build` (it asserts `__GAME_TEST__` is absent). `npm run test:release` handles
  this correctly on its own.
- Full-suite runs with 2 parallel workers occasionally time out
  `tests/assets/car-visual.spec.ts` / `texture-visual.spec.ts` under load. If exactly
  those fail in a full run, re-run them in isolation before concluding you broke them.
- Unit tests: `npx vitest run` (Node environment; `three` imports work in Node, the Web
  Audio API and WebGL do not). Rapier works headlessly in Vitest — the existing
  `tests/unit/physicsFacade.spec.ts` / `opponentAi.spec.ts` show the pattern
  (`await physics.initialise()` then `stepTicks(n)`).
- Verification command block (run after every workstream):

  ```bash
  npx vue-tsc --noEmit
  npm run validate
  npx vitest run
  PLAYWRIGHT_TEST=1 npx vite build
  PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test --project=chromium-dev --project=chromium-preview
  ```

### 0.2 Do-not-break invariants

1. **Never use `Math.random()`** anywhere in `src/` — use
   `SeededRandom` (`src/assets/procedural/SeededRandom.ts`). `validate-architecture` does
   not catch this but the project convention (Master Brief "Never Do These") does.
2. Exactly one renderer / scene / camera / `AudioContext` / rAF loop / Rapier world.
3. Do not change `data-testid` attributes or user-visible button text
   (`PLAY`, `SETTINGS`, `START MATCH`, `RESUME`, `REPLAY`, `RETURN TO MENU`, `BACK`,
   duration labels `1 MIN`/`3 MIN`/`10 MIN`, difficulty labels) — the Playwright suites
   and `tests/release/release-gate.spec.ts` select on them.
4. `npm run validate` (contracts, threejs-skills, assets, architecture) must stay green.
5. Keep the module boundaries: physics never imports Vue/AI/game-flow; AI reads only
   public physics observations; UI talks to the engine only via `GameRuntime` facade
   methods.
6. All new tunables go in the existing constants/parameters files
   (`CameraConstants.ts`, `PhysicsParameters.ts`, `PhysicsConstants.ts`), never inlined.

### 0.3 Workflow per workstream

Implement → add/update the listed tests → run the verification block → update
`docs/implementation-progress.md` (short entry per workstream) and the matching
deviations doc (`docs/physics-deviations.md`, `docs/visual-language-deviations.md`,
`docs/integration-deviations.md`, `docs/ai-calibration-log.md` as appropriate) →
commit with a descriptive message → push to the working branch. One commit per
workstream (WS2+WS3 may share one commit if convenient; nothing larger).

### 0.4 Workstream order (dependencies)

| # | Workstream | Depends on |
|---|-----------|------------|
| WS1 | Input correctness: steering sign + gamepad | — |
| WS2 | Driving feel: grip & steering response | WS1 (sign fix) |
| WS3 | Jump / dodge / flip overhaul | WS2 |
| WS4 | Camera overhaul (Rocket League model) | WS1 (verifiable by hand) |
| WS5 | Arena: transparent shell, goals, fillets, wall driving, pads | WS2 (grip makes wall-drive work) |
| WS6 | Opponent AI: simplify + unstuck | WS1, WS2, WS5 |
| WS7 | Gameplay: spawns, auto-flip, ghost world, particles | — |
| WS8 | Graphics: jitter removal, floor texture pass | — |
| WS9 | UI restyle (PS1 Wipeout) | — |
| WS10 | Final integration pass & release gate | all |

---

## WS1 — Input correctness (steering sign + controller support)

### WS1.A Steering is inverted (keyboard "left/right swapped")

**Root cause (verified):** `src/physics/car/GroundSteeringController.ts:19-20` computes
`desiredYawRate = steer * maxCurvature(|v|) * |v| * sign(v)` around `supportNormal`
(+Y on the floor). With the car's local forward being `(0,0,-1)`, a **positive** yaw
rate about +Y rotates the car to its **left**. Human input maps D →
`steer = steerRight - steerLeft = +1` (`src/input/LogicalGameplayState.ts:53`), so
pressing D turns the car left. The AI already knows this and compensates with a
negation — see the comment block at `src/ai/GroundManeuverController.ts:40-50`
("Physics's GroundSteeringController maps positive steer to … its left, not its
right. Negate…").

**Change:**
1. In `GroundSteeringController.ts`, negate the steering term so positive `steer`
   yields a rightward turn:
   ```ts
   const desiredYawRate =
     -steer * maxCurvature(Math.abs(forwardSpeed)) * Math.abs(forwardSpeed) * V.signOrOne(forwardSpeed);
   ```
   Add a one-line comment: `// steer:+1 = turn right = negative yaw about the support normal (car forward is local -Z).`
2. In `src/ai/GroundManeuverController.ts:50`, remove the compensating negation:
   `const steer = V.clamp(angleError * AI_CONSTANTS.steerGain, -1, 1);` and rewrite the
   comment above it to say positive heading error (target to the right) now maps
   directly to positive steer.
3. Grep the whole of `src/ai/` for any other spot that flips a steer sign to compensate
   (`grep -rn "steer" src/ai/` and read each hit — kickoff and shadow/challenge paths
   route through `driveTowardPoint`, but confirm none construct `CarInput.steer`
   directly with a negation).

**Tests (new file `tests/unit/steeringDirection.spec.ts`):**
- Spawn a car on `flat-plane` at origin, identity rotation (facing -Z). Drive
  `throttle=1` for 120 ticks to reach speed, then `steer=+1` for 120 ticks. Assert the
  car's forward vector has rotated **clockwise viewed from above**: with initial
  forward (0,0,-1), clockwise means `forward.x` becomes **negative**… careful — work it
  through with the cross product in the test rather than guessing:
  `sign(cross(initialForward, currentForward).y)` must be **negative** for a right
  turn. Assert exactly that, plus the mirrored case for `steer=-1`.
- AI regression: place a ball 10m to the car's right, run `driveTowardPoint`
  through the physics loop for 240 ticks, assert final distance to the target
  < initial distance * 0.5 (the AI still converges after the double sign-flip).
- Keep `tests/unit/opponentAi.spec.ts` and `tests/ai/*.spec.ts` green — they will
  catch any missed compensation site.

### WS1.B Controller input doesn't work

**PRIMARY root cause (confirmed by live testing — fix this first):**
`src/input/testing/BrowserInputTestApi.ts` installs whenever `__DEV__ || __TEST_BUILD__`
(line 65 — i.e. every `npm run dev` session and every `PLAYWRIGHT_TEST=1` build), and at
line 100 it **unconditionally** calls
`input.useVirtualGamepadProvider(virtualGamepadProvider)`. Per
`InputControlsModule.useVirtualGamepadProvider` (`InputControlsModule.ts:213-216`), that
replaces the real `BrowserGamepadProvider` and clears the pad assignment — so
`navigator.getGamepads()` is **never polled again** in any dev/test build. The virtual
provider returns no gamepads unless a test explicitly connects one, so physical
controllers are completely dead while keyboard/mouse (real DOM listeners) keep working —
exactly the observed symptom. The call site is `GameRuntime.initialise`
(`GameRuntime.ts:212` → `installInputTestApi(input, canvas)`), which runs on every boot.

**Fix — swap to the virtual provider lazily, and restore on reset
(`BrowserInputTestApi.ts` + one new module method):**
1. Delete the unconditional `input.useVirtualGamepadProvider(virtualGamepadProvider);`
   at line 100.
2. Track state inside `installInputTestApi`: `let virtualProviderActive = false;`
   In the `connectVirtualGamepad` API method, before delegating to the provider:
   ```ts
   if (!virtualProviderActive) {
     input.useVirtualGamepadProvider(virtualGamepadProvider);
     virtualProviderActive = true;
   }
   ```
   (Existing Playwright/unit tests always call `connectVirtualGamepad` before
   `setVirtualGamepadState`/`assignGamepad`, so lazy activation preserves their
   behaviour — verify by reading `tests/input/foundation.spec.ts`'s virtual-gamepad
   test before and after.)
3. In the `reset()` API method, after `virtualGamepadProvider.reset()`: if
   `virtualProviderActive`, restore real hardware and clear the flag. Add the matching
   module method next to `useVirtualGamepadProvider` in `InputControlsModule.ts`:
   ```ts
   /** Test-only counterpart of useVirtualGamepadProvider: restore real hardware polling. */
   public useBrowserGamepadProvider(): void {
     this.gamepadProvider = new BrowserGamepadProvider();
     this.assignGamepad(null);
   }
   ```
4. Make the swap observable so it can be tested in a real browser: add
   `gamepadProviderKind: "browser" | "virtual"` to `InputDiagnostics`
   (`src/input/InputTypes.ts:138-144`) and report it from
   `InputControlsModule.getDiagnostics()` (track a private field set by the two
   `use*Provider` methods; initial value `"browser"`).

**Tests for the primary fix:**
- Playwright (add to `tests/input/foundation.spec.ts`): on boot, **before** any
  virtual-gamepad call, `__INPUT_TEST__.getDiagnostics().gamepadProviderKind === "browser"`
  — this is the regression gate proving dev builds keep polling real hardware. After
  `connectVirtualGamepad(...)` it must be `"virtual"`; after `reset()` it must be
  `"browser"` again.
- The existing virtual-gamepad connect/disconnect Playwright test must stay green
  (proves lazy activation didn't break the test path).

**SECONDARY root causes (verified in `src/input/InputControlsModule.ts`; real once
polling works, and they matter for feel/completeness — fix all three):**
1. `activeDevice` only switches to `"gamepad"` on a *button press edge*
   (lines ~191-196). Moving a stick or squeezing a trigger never activates the pad, and
   any keyboard/mouse touch (including the one-time audio-resume gesture) flips it back
   to `"keyboard-mouse"` permanently until another pad *button* press.
2. The pad never generates action edges: `pushEdge("JUMP"/"BALL_CAMERA"/"PAUSE", …)` is
   only called from keyboard/mouse handlers (lines ~107-130). Pad jump only sets
   `jumpHeld`; physics jump-edge detection (`JumpController.isJumpPressed`) works off
   held state so jumping actually works — but ball-cam (Y/north), pause (Start) and the
   UI never respond to the pad at all, which reads as "controller does not work".
3. `airRollModifier` on pad is wired to the **reverse trigger** value
   (line ~287-288), so braking mid-air converts stick input into roll. RL's default
   air-roll(/powerslide) button is X/west — use `powerslideButton` instead.

**Change (all in `InputControlsModule.ts`):**
1. In `pollGamepad()`, after the existing button-edge loop, also promote the device on
   analog activity:
   ```ts
   const stickActive = Math.abs(gamepad.axes[STANDARD_GAMEPAD_AXES.leftX] ?? 0) > 0.35
     || Math.abs(gamepad.axes[STANDARD_GAMEPAD_AXES.leftY] ?? 0) > 0.35
     || (gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.accelerateButton]?.value ?? 0) > 0.25;
   if (stickActive) this.activeDevice = "gamepad";
   ```
2. In the same button-edge loop (where `wasPressed/isPressed` are already computed),
   push edges for the mapped action buttons on a rising edge:
   `jumpButton → pushEdge("JUMP","pressed")`, falling edge → `("JUMP","released")`;
   `ballCameraButton → ("BALL_CAMERA","pressed")`; `pauseButton → ("PAUSE","pressed")`.
3. In `buildLogicalStateFromGamepad()`, set
   `airRollModifier = gamepad.buttons[DEFAULT_GAMEPAD_BINDINGS.powerslideButton]?.pressed ?? false`
   (delete the reverse-trigger version). `DEFAULT_GAMEPAD_BINDINGS.airRollModifierButton`
   currently aliases leftTrigger — repoint it at `STANDARD_GAMEPAD_BUTTONS.west` in
   `src/input/bindings/DefaultBindings.ts` so the constant matches behaviour.
4. Leave `applyDeadzone` (0.?? — see `AXIS_DEADZONE`) as is, but confirm the deadzone
   constant is ≤ 0.15; if larger, set it to 0.15.
5. `rearViewHeld` for pads: in `sampleGameplayInputForTick`, the camera struct hardcodes
   mouse-only rear view. Extend: when `activeDevice === "gamepad"`, use
   `latestGamepadSnapshot.buttons[DEFAULT_GAMEPAD_BINDINGS.rearViewButton]?.pressed`.

**Tests (extend `tests/unit/carInputResolution.spec.ts` or new
`tests/unit/gamepadInput.spec.ts`, using the existing `VirtualGamepadProvider`
pattern from `tests/input/foundation.spec.ts` / the module's
`useVirtualGamepadProvider`):**
- Axis-only activation: connect a virtual pad, set leftX = 0.8, no buttons; after one
  `updateBrowserFrame` + sample, `sourceDevice === "gamepad"` and `car.steer` ≈ 0.8.
- Jump edge: press south button → `edges.jumpPressed === true` exactly once across two
  samples; release → `jumpReleased` once.
- Pause edge: press start → `edges.pausePressed === true` (this drives
  `GameRuntime.pauseMatch()` which is already wired).
- Ball-cam edge: press north → `camera.toggleBallCameraPressed === true` once.
- Air-roll: hold west + leftX=1 while airborne context → `car.roll === 1`, `car.yaw === 0`.
- Playwright (`tests/input/foundation.spec.ts` already covers virtual-pad
  connect/disconnect — add one case): virtual pad steer-right during a live match turns
  the car clockwise (reuse the WS1.A cross-product assertion via
  `__GAME_TEST__`/`__PHYSICS_TEST__` car state).

**Manual verification note for the implementer:** real hardware can't be tested here;
the `gamepadProviderKind === "browser"` boot assertion plus the virtual-provider tests
plus the four root-cause fixes (one primary + three secondary) are the gate. Do not add
speculative per-browser hacks.

---

## WS2 — Driving feel: tight, responsive, stops drifting

**Problem:** cars keep yawing after the stick is released and slide ("drift") for a long
time after turns.

**Root cause:** in `src/physics/PhysicsParameters.ts` the yaw servo and lateral grip are
far too soft for RL-feel:
- `steering.response: 12`, `maximumYawAcceleration: 25` — when steer returns to 0 the
  servo's correction toward `desiredYawRate = 0` is slow, so residual yaw persists for
  hundreds of ms.
- `grip.normalRate: 12` (per-second lateral-velocity kill rate) with
  `normalMaxAcceleration: 60` — lateral velocity e-folds in ~83ms *when unclamped*, but
  the clamp dominates after fast turns, stretching slides to ~0.5s+.

Rocket League ground handling is effectively rail-grip: without powerslide, lateral
velocity dies almost immediately, and yaw rate tracks the curvature curve tightly
(max yaw rate ~2.2 rad/s at max drive speed, and near-instant decay to zero on release).

**Change (`DEFAULT_PHYSICS_PARAMETERS` in `PhysicsParameters.ts`):**

| Field | Old | New |
|---|---|---|
| `grip.normalRate` | 12 | **40** |
| `grip.normalMaxAcceleration` | 60 | **90** |
| `grip.powerslideRate` | 2 | 2 (unchanged — sliding is the point) |
| `grip.powerslideMaxAcceleration` | 18 | 18 (unchanged) |
| `steering.response` | 12 | **30** |
| `steering.maximumYawAcceleration` | 25 | **60** |

No structural changes: the yaw-rate servo already drives toward `desiredYawRate = 0`
when `steer = 0`; it just needs authority. Do **not** add rigid-body angular damping
(it would fight aerial control and dodges).

Also verify (and fix if untrue) that `applyLateralGrip` runs *before* `world.step()`
each tick for both cars regardless of throttle — it does today via
`CarController.prePhysicsTick`.

**Tests (new file `tests/unit/drivingFeel.spec.ts`, headless PhysicsFacade,
`flat-plane` preset):**
1. **Yaw stop**: drive to ~14 m/s, apply `steer=1` for 60 ticks, then `steer=0`.
   Assert |yaw rate| (angvel·up) drops below **0.4 rad/s within 24 ticks (0.2s)** of
   release, and below 0.1 rad/s within 48 ticks.
2. **Slide stop**: same setup; at steer release, record lateral speed
   (linvel · carRight); assert |lateral speed| < **0.8 m/s within 30 ticks (0.25s)**.
3. **Turn rate correctness**: steady-state full-steer at full no-boost speed
   (throttle held, wait 240 ticks): measured yaw rate within **±20%** of
   `maxCurvature(speed) * speed` (≈2.2 rad/s at 14.1 m/s).
4. **Powerslide still slides**: with `powerslide=true` during the turn, lateral speed
   at release must be **> 2 m/s** (proves the two grip modes still diverge).
5. **Straight-line stability**: full throttle 480 ticks, no steer: |lateral speed|
   stays < 0.3 m/s and heading deviates < 3°.

Existing gates that must stay green: `tests/unit/carController.spec.ts`,
`tests/unit/physicsFacade.spec.ts`, `tests/physics/car-driving.spec.ts` (Playwright).
If `carController.spec.ts` asserts old numeric outcomes tied to the soft tuning,
update those expectations — but only after reading the test to confirm it's a tuning
assertion, not a correctness one.

---

## WS3 — Jump, dodge and flip: real Rocket League behaviour

**Problem:** double-jump directional dodge doesn't do the crisp full flip that lands
back on the wheels and propels the car forward.

**Root causes (verified):**
1. `src/physics/car/DodgeController.ts` drives the flip with a *torque* ramp
   (`angularAcceleration: 35` for 0.65s) fought by nothing — total rotation is
   unbounded/inconsistent, there's no guaranteed 360°, and residual spin persists into
   landing.
2. Dodge direction sign is suspect: `direction.forward = -car.currentInput.pitch`
   (line 14). Keyboard W in the air → `pitchNoseDown = 1` → `pitch = +1` → forward
   component **-1**, i.e. holding W (nose-down, RL front-flip stick direction) produces
   a **backward** dodge. Do not "fix by inspection" — the tests below pin the correct
   behaviour; make the code satisfy the tests. (RL convention: stick forward / W =
   nose-down pitch = **front** flip + forward impulse.)
3. No vertical-velocity cancel on dodge (RL zeroes upward velocity when a directional
   dodge starts, which is what makes speed-flips/front-flips hug the ground).

**Change — rewrite `DodgeController.ts` with kinematic flip rotation:**

1. **Trigger (`tryTriggerDodge`)** — keep deadzone and impulse structure, with fixes:
   - `direction.forward = -car.currentInput.pitch` → verify against the new tests;
     the correct mapping is: input that pitches the nose down produces a **forward**
     dodge. Given `pitch = pitchNoseDown - pitchNoseUp` (W=+1), that means
     `direction.forward = +car.currentInput.pitch`… **write the test first, then set
     the sign so the test passes** (the rotation sign in step 2 must be consistent
     with it — the pair of signs is what matters).
   - Compute the world dodge direction from the car's *flattened* forward/right
     (project onto the horizontal plane and normalise) so a slightly nose-up car still
     dodges horizontally, like RL.
   - **Vertical cancel:** before applying the impulse, if `linvel.y > 0`, set the body's
     linear velocity y to 0 (`body.setLinvel({...linvel, y: 0}, true)`).
   - Apply the linear impulse (keep `linearImpulse: 5.0` m/s ≈ RL's 500 uu/s), then
     **cap** planar speed at `RL_CONSTANTS.carMaxSpeed` (23): if exceeded, rescale the
     horizontal velocity components.
   - Store the flip axis **once** at trigger time (world space):
     `flipAxis = normalize(cross(worldUp, dodgeDirectionWorld))` — this axis produces a
     nose-down rotation for a forward dodge (right-hand rule; verify via test).
     Store it on `car.runtime` (add `dodgeAxis: Vec3Like` to
     `src/physics/car/CarRuntimeState.ts`, initialised to zero and reset with the other
     dodge fields).

2. **Active phase (`updateDodgeState`)** — replace torque with direct angular-velocity
   control:
   ```ts
   const FLIP_RATE = (2 * Math.PI) / parameters.dodge.activeDuration; // ≈ 9.67 rad/s → one full 360°
   ```
   Each active tick, unless flip-cancelling: `car.body.setAngvel(scale(flipAxis, FLIP_RATE), true)`.
   - **Flip cancel:** if the player holds pitch *against* the flip (input pitch sign
     opposite to the dodge's forward component) with magnitude > 0.5, blend the applied
     rate toward 0 over 0.1s and end the active phase early (transition to recovery).
   - On transition to `recovery`: zero the pitch/roll components of angular velocity —
     `setAngvel(scale(supportUpOrWorldUp, dot(angvel, worldUp)))` (keep yaw only) — so
     the car lands flat instead of carrying spin.
   - Remove the old `flipCancelPitchDeceleration` torque path; keep the parameter key
     (unused params are fine) or delete it and its references consistently.

3. **Landing:** no change needed — ground `applyUprightAlignment` + suspension settle
   the car. But bump nothing else; test 3 below gates the outcome.

**Tests (new file `tests/unit/dodgeFlip.spec.ts`):**
1. **Forward flip completes and lands on wheels:** flat plane; drive straight to
   ~10 m/s; set `jump = true` for 1 tick, then `jump = false` for ≥ 5 ticks (the
   physics jump-edge detector `isJumpPressed` requires a release between presses —
   holding jump across both inputs will NOT trigger the dodge), then `jump = true`
   again with `pitch` set to the nose-down/forward value (match keyboard W's mapping:
   `pitch = +1`); run 240 ticks.
   Assert: (a) cumulative rotation about the flip axis ≥ **300°** within 90 ticks of
   the dodge (integrate `dot(angvel, flipAxisApprox) * dt` per tick, using the car's
   right vector at dodge start as the axis); (b) at t+2s the car is grounded with
   `carUp.y > 0.9`.
2. **Forward flip accelerates:** forward speed (linvel · flatForward) measured 30 ticks
   after the dodge is ≥ pre-dodge speed + **3.5 m/s** (5.0 impulse minus small losses),
   and horizontal speed never exceeds 23.05.
3. **Vertical cancel:** trigger the dodge while `linvel.y > 1` (jump then dodge at
   apex): one tick after the dodge, `linvel.y ≤ 0.2`.
4. **Flip cancel:** same as test 1 but hold opposite pitch from 5 ticks after the
   dodge: cumulative rotation < **220°**, and the car still lands upright within 2.5s
   (upright alignment does the rest).
5. **Sideways dodge:** dodge with pure `yaw = 1` input: car rolls about its forward
   axis (cumulative rotation about flatForward ≥ 300°) and gains lateral speed ≥ 3.5 m/s
   toward its right.
6. **Backflip direction sanity:** `pitch` at the nose-up value produces a dodge impulse
   opposite the car's forward (dot(velocityDelta, flatForward) < 0).

These six tests pin every sign; if any pair of signs is flipped, at least one fails.
Existing `tests/physics/car-driving.spec.ts` ("jump + boost + dodge … without NaN")
must stay green.

---

## WS4 — Camera overhaul: Rocket League rig

**Problem:** camera is far away, floats, and the car isn't kept bottom-centre; in ball
cam the car can leave the frame entirely (see reference screenshots — the car sits in
the bottom-centre in *both* modes, and the rig is close).

**Reference (Rocket League defaults / pro-standard, converted at 100uu = 1m):**
distance 270uu → **2.7m**, height 110uu → **1.1m**, angle **-3°…-5°**, FOV setting 110
(horizontal) → **~77° vertical** at 16:9, stiffness ~0.45.
Sources: [Epic camera-settings support page](https://www.epicgames.com/help/c-202300000001622/c-202300000001682/what-are-camera-settings-in-rocket-league-a202300000018048),
[Dot Esports settings guide](https://dotesports.com/rocket-league/news/best-rocket-league-camera-settings),
[jeu.video camera guide](https://jeu.video/en/guide/rocket-league-camera-settings).

Key geometric insight for ball cam: **camera, car and ball are kept roughly collinear**
— the camera sits on the far side of the car from the ball (yaw-only), raised by the
height offset, looking at the ball. Because the camera is ~1.1m above the car and only
~2.7m behind it, the car naturally projects into the bottom-centre of the frame while
the ball stays centred. No screen-space math needed.

### Change — rewrite `updateChaseCamera` in `src/camera/ChaseCameraController.ts`

Replace `CHASE_CAMERA_CONSTANTS` in `src/camera/CameraConstants.ts` wholesale:

```ts
export const CHASE_CAMERA_CONSTANTS = {
  distance: 2.75,          // RL 270uu
  height: 1.1,             // RL 110uu
  fov: 77,                 // vertical FOV ≈ RL "110" horizontal at 16:9
  angleDegrees: -4,        // downward pitch bias in normal cam

  // Stiffness model: position lags, aim does not.
  positionSmoothingRate: 11,   // ≈ RL stiffness ~0.45 feel; higher = stiffer
  yawSmoothingRate: 8,         // smooths the chase direction, not the aim
  targetSmoothingRate: 30,     // aim stays crisp

  ballCamCarBias: 0.15,        // fraction the aim point pulls from ball toward car

  minHeightAboveFloor: 0.35,

  menuOrbitRadius: 20,
  menuOrbitHeight: 9,
  menuOrbitAngularSpeed: 0.05
} as const;
```

Delete the now-unused keys (`lookAhead`, framing/ballWeight/collision keys); fix all
references.

Algorithm per render frame (replacing the body of `updateChaseCamera`, keeping the
menu path, swivel, and rear-view semantics):

1. Read interpolated car + ball as today.
2. **Chase yaw direction (horizontal only):** `chaseDir` = the unit vector pointing
   from the car **toward where the camera should sit**.
   - Normal cam: `-flat(carForward)` (flatten = zero y, normalise; if the flattened
     vector's length < 0.1 — car pointing straight up/down a wall — keep the previous
     smoothed direction). Do **not** use velocity here: it flips 180° when reversing,
     which RL's camera does not do. The yaw smoothing below supplies the RL-style
     "camera swings out in turns" lag.
   - Ball cam: `flat(carPosition - ballPosition)` (unit vector from ball toward car —
     the camera goes behind the car relative to the ball, making camera/car/ball
     roughly collinear).
   - Rear view: negate the chosen direction.
   - Smooth this **direction's yaw angle** with `yawSmoothingRate` (store a persistent
     `smoothedYaw` number; lerp via shortest-arc angle difference, alpha
     `1-exp(-rate*dt)`). Apply swivel as yaw/pitch offsets on top, as today.
3. **Position:** `desired = carPos + smoothedDir * distance + (0,height,0)`.
   Smooth with `positionSmoothingRate` exactly as the existing exp-lerp.
   Clamp `position.y ≥ minHeightAboveFloor`. **Delete the `raycastArena` pull-in block
   entirely** — walls become transparent in WS5 and RL-style cameras clip through them;
   the floor clamp is the only constraint. (`PhysicsFacade.raycastArena` keeps its
   other consumers, if any — grep first; if the camera was the only caller, leave the
   facade method in place but unused, it is public API used by tests? grep
   `raycastArena` in `tests/` too; delete only if unreferenced.)
4. **Aim target:** define `aheadDir = -smoothedDir` (points the way the camera faces;
   this automatically flips for rear view).
   - Normal cam: `carPos + aheadDir * 4 + (0, 0.4, 0)` — a point 4m in front of the
     car at 0.4m height. Then apply the `angleDegrees` pitch bias by rotating the
     (camera→target) vector down by 4° about the camera's right axis. (Net effect: car
     sits bottom-centre, horizon visible.)
   - Ball cam: `lerp(ballPos, carPos, ballCamCarBias)` — aiming a touch below/behind
     the ball keeps the ball slightly above centre and the car anchored bottom-centre.
   - Smooth with `targetSmoothingRate`; `camera.lookAt(smoothedTarget)`.
5. Set `camera.fov = 77` once in the constructor (as today) — and **add `aspect` and
   the camera quaternion to `CameraDiagnostics`** (needed by the tests):
   `aspect: this.camera.aspect`, `quaternion: {x,y,z,w}`.

### Tests

**New Playwright file `tests/camera/rl-framing.spec.ts`** (project conventions from
`tests/camera/chase-camera.spec.ts`: boot, `__GAME_TEST__.gameFlow` start match,
`stepFixedTicks`, poll). The test computes NDC projection in Node using `three`
(import it in the test file — it runs under Node, that's fine):

```ts
import * as THREE from "three";
function toNdc(diag, point, viewportAspect) {
  const cam = new THREE.PerspectiveCamera(diag.fov, diag.aspect, 0.1, 500);
  cam.position.set(diag.position.x, diag.position.y, diag.position.z);
  cam.quaternion.set(diag.quaternion.x, ...); cam.updateMatrixWorld();
  return new THREE.Vector3(point.x, point.y, point.z).project(cam);
}
```

1. **Car bottom-centre, normal cam:** start match, drive forward (real held W key)
   for ~2s, sample 10 frames: car-position NDC must satisfy `|x| < 0.35` and
   `y ∈ [-0.95, -0.05]` in ≥ 8 of 10 samples.
2. **Ball cam keeps both framed:** toggle ball cam (Space), teleport ball
   (`__GAME_TEST__.gameFlow` helpers / `__PHYSICS_TEST__.setBallState`) to 15m ahead;
   sample: ball NDC `|x| < 0.3`, `y ∈ [-0.5, 0.7]`; car NDC `y < 0` and `|x| < 0.5`
   (car visible, lower half).
3. **Close rig:** camera-to-car distance stays in `[2.0, 4.5]` m during normal driving
   (was ~8-13 before).
4. **No wall pull-in:** drive the car against a side wall; camera distance-to-car never
   drops below 1.5m (the old collision code would crush it to ~0).

**Update existing test:** `tests/camera/chase-camera.spec.ts` asserts the camera "stays
inside the arena" — relax those bounds by ±4m (the camera may now poke through
transparent walls by design), and update any assertion pinned to the old FOV (72) or
distance. Read that spec fully before editing.

Note for the settings panel: the CAMERA settings category sliders remain non-live
(pre-existing deferred state) — do not wire them in this pass; note it in docs.

---

## WS5 — Arena: transparent shell, real goals, curved fillets, wall driving, seated pads

This is the largest workstream. Sub-parts are independent; implement in the order
given. All visual work happens in `src/assets/procedural/StadiumGeometryFactory.ts`;
all physics work in `src/physics/arena/TestArenaPresets.ts` +
`src/physics/PhysicsFacade.ts`.

### WS5.A Transparent glass shell with hex pattern

**Change:**
1. New factory `src/assets/procedural/HexPatternTexture.ts`:
   `createHexShellTexture(): THREE.CanvasTexture` — 512×512 canvas, transparent
   background, stroked hexagon grid (flat-top hexes, circumradius 48px, stroke
   `rgba(150, 225, 255, 0.55)`, lineWidth 2.5), plus a second pass of the same grid
   offset by half a cell at `rgba(150,225,255,0.12)` for depth. Fully deterministic —
   no randomness. Set `wrapS = wrapT = RepeatWrapping`, `magFilter = NearestFilter`
   (PSX look), `colorSpace = SRGBColorSpace`.
2. In `StadiumGeometryFactory.ts`, replace the wall/ceiling material (currently opaque
   `MeshStandardMaterial` with the wall texture) with a shared **glass shell
   material**:
   ```ts
   new THREE.MeshStandardMaterial({
     color: 0x9fd8ff,
     map: hexTexture,            // repeat set per-surface: ~1 hex cell per 2m
     transparent: true,
     opacity: 0.16,
     roughness: 0.15,
     metalness: 0.6,
     side: THREE.DoubleSide,
     depthWrite: false
   });
   ```
   Set `mesh.renderOrder = 10` on every shell mesh so they draw after opaque geometry.
   Apply it to: side walls, ceiling, end-wall segments + lintels, and (WS5.B) the goal
   box shell. The **floor stays opaque** (WS8 retextures it). Keep the structural ribs
   opaque — they read as the frame holding the glass.
   Texture repeat: `hexTexture.repeat.set(surfaceWidthMeters / 2, surfaceHeightMeters / 2)`
   — but note the material is shared, so **clone the texture per surface class**
   (walls / ceiling / ends) or use one repeat that looks acceptable everywhere
   (`repeat.set(10, 10)` is fine for v1; choose the simple path).
3. Delete the old `wallTexture` usage for these surfaces (the concrete wall texture
   moves to nothing — it's fine to stop using it).
4. The starfield (`createDefaultStarfield`) already surrounds the arena and will now be
   visible through the shell — verify it renders (it does; it's added in
   `buildPlaceholderWorld`).

**Tests:**
- Extend `tests/visual-language/stadium-vfx.spec.ts` (or new
  `tests/visual-language/arena-shell.spec.ts`): via a small new test hook — add to the
  asset test API (`window.__ASSET_TEST__`, see `src/assets/testing/…`) a method
  `getStadiumShellInfo(): { transparentMeshCount: number; opaqueWallCount: number }`
  implemented by traversing the built stadium group for materials with
  `transparent === true && opacity < 0.5`. Assert `transparentMeshCount ≥ 6` (2 side
  walls + ceiling + 2 end-wall groups' segments) and that the floor's material is
  opaque. Also assert zero console errors on a live match (existing pattern).
- Visual gate is manual (screenshot in QA pass, WS10).

### WS5.B Enclosed, visible goals + fix the goal-edge phase-through

**Problems:** (1) visually the goal opening leads to empty void (no back/side/roof
meshes exist — only physics colliders); (2) the **visual** goal opening is 10m wide
(`DEFAULT_STADIUM_DIMENSIONS.goalWidth: 10` in `src/assets/AssetTypes.ts`) while the
**physics** opening is 14m (`GOAL_HALF_WIDTH = 7` in `src/physics/goal/GoalTypes.ts`) —
cars/balls pass through what looks like wall; (3) cars can phase through the seam where
the end wall meets the goal-box side walls.

**Change:**
1. **Unify dimensions:** in `src/assets/AssetTypes.ts` set
   `goalWidth: 14, goalHeight: 6` and add `goalDepth: 5` to
   `StadiumGenerationDimensions` + defaults, with a comment that these mirror
   `GOAL_HALF_WIDTH/GOAL_HEIGHT/GOAL_DEPTH` in `src/physics/goal/GoalTypes.ts` (assets
   may not import from physics — check `validate-architecture` rules; if an
   assets→physics import is *not* forbidden by `scripts/validate-architecture.mjs`
   (it isn't — only stores are banned for assets), prefer importing the physics
   constants directly instead of duplicating).
2. **Goal shell visuals** in `createEndWallWithGoalGap`: add, per end, using the WS5.A
   glass material: back wall (`goalWidth × goalHeight` plane/box at
   `z = zSign*(fieldLength/2 + goalDepth)`), two side walls, and a roof — matching the
   physics goal-box colliders' positions in `TestArenaPresets.buildGoalEnd` exactly
   (read that function and mirror its numbers; field half-length there is 30 and
   `fieldLength/2` here is also 30 — they agree). Add an **emissive goal frame**: four
   thin box meshes (0.15×0.15 section) outlining the goal mouth,
   `MeshBasicMaterial({ color: VISUAL_PALETTE.playerCyan })` for the player's defended
   goal (negative Z) and `opponentMagenta` for the other.
3. **Seam fix (physics)** in `TestArenaPresets.buildGoalEnd`:
   - Extend both goal-box side walls and the roof to **overlap** the end wall: change
     their z half-extent from `GOAL_DEPTH/2` to `GOAL_DEPTH/2 + 0.5` and shift centre z
     by `-zSign*0.5`, so they start flush *inside* the arena wall plane instead of
     meeting it edge-to-edge.
   - Widen the two side-post wall segments by 0.25 toward the goal: change half-extent
     x from `sidePostWidth` … actually simpler and sufficient: **increase overlap**, add
     0.25 to each side-post half-extent and shift its centre 0.25 toward the goal
     centreline, so post and box-side-wall volumes interpenetrate. Overlapping static
     colliders are harmless in Rapier.
4. **Ball kickoff spawn:** in `src/physics/PhysicsFacade.ts:41` change
   `DEFAULT_BALL_SPAWN` from `{x:0, y:8, z:0}` to `{x:0, y: RL_CONSTANTS.ballRadius, z:0}`
   — the ball currently falls from 8m at every kickoff. Check
   `tests/physics/foundation.spec.ts` ("ball visibly falls and settles") — that test
   relies on the drop; update it to spawn its own elevated ball via
   `__PHYSICS_TEST__.setBallState` instead of relying on the default.

**Tests (new `tests/unit/goalIntegrity.spec.ts`):**
1. **No phase-through:** for each of 8 attack vectors aimed at the four goal-mouth
   corners/seams (e.g. car at (±6.8, 0.5, ±27) driving with boost at the seam, and
   ball fired via `setBallState` with velocity 40 m/s at the corner points), step 600
   ticks and assert every tick:
   `|x| ≤ halfWidth + 1.2`, `-1 ≤ y ≤ height + 1.2`, `|z| ≤ halfLength + GOAL_DEPTH + 1.2`.
2. **Goal still scores:** ball fired straight down the middle into each goal → goal
   event for the correct team (mirrors existing goal-sensor tests — read
   `tests/unit/goalSensors.spec.ts` and extend there if a better fit).
3. **Ball kickoff on ground:** after `resetWorld`, ball y ≈ ballRadius (±0.05) and
   |velocity| < 0.1 within 30 ticks.

### WS5.C Curved floor→wall fillets + wall driving

**Goal:** replace the sharp 90° floor/wall junction with a quarter-round fillet the car
can drive up smoothly, with physics support for wall driving (suspension already casts
along car-local down — `SuspensionController.ts:43` — and grounded logic follows any
`supportNormal`, so ramps work once the geometry exists; WS2's grip increase is what
holds the car on the wall laterally).

**Physics change:**
1. Extend `ArenaColliderSpec` (in `TestArenaPresets.ts`) with an optional
   `rotation?: { x: number; y: number; z: number; w: number }`, and apply it in
   `PhysicsFacade.buildArena` via `ColliderDesc.cuboid(...).setRotation(rotation)`
   (fixed colliders are created on bodies — check the existing creation call at
   `PhysicsFacade.ts:167`; colliders take `.setRotation` on the desc; keep translation
   handling as is).
2. Add `filletColliders()` to `TestArenaPresets.ts`. Parameters:
   `FILLET_RADIUS = 2.0`, `SEGMENTS = 5`, `SEG_HALF_THICK = 0.12`.
   For a wall whose interior face is the plane `x = -halfWidth` (left wall), the fillet
   arc centre line is at `(-(halfWidth - R), R)` in the x/y plane, running the full
   length in z. Segment i (i = 0..4), θᵢ = (i + 0.5) · (π/2) / SEGMENTS:
   - centre: `x = -(halfWidth - R) - (R - SEG_HALF_THICK) * sin(θᵢ)`,
     `y = R - (R - SEG_HALF_THICK) * cos(θᵢ)`, `z = 0`
   - halfExtents: `{ x: R * (π/2) / SEGMENTS * 0.6, y: SEG_HALF_THICK, z: halfLength }`
     — the x half-extent ≈ half the chord length with a small overlap factor.
   - rotation: about the **z axis** by `-θᵢ` for the left wall (`+θᵢ` right wall) —
     derive the sign by testing: at θ→0 the segment must be horizontal (floor-like), at
     θ→90° vertical (wall-like). Encode as a quaternion from axis-angle.
   Mirror for the right wall (x positive, signs flipped), and for both **end walls**
   (arc in z/y plane, z axis ↔ x axis swapped, spanning x only across
   `[-halfWidth, -GOAL_HALF_WIDTH]` and `[GOAL_HALF_WIDTH, halfWidth]` so the goal
   mouth stays open — i.e. two shorter fillet runs per end, each with x half-extent
   `(halfWidth - GOAL_HALF_WIDTH)/2` and centred between).
   Corner regions where two fillets meet are left unfilleted (acceptable v1).
3. **Wall-stick assist** in `CarController.prePhysicsTick`: after the grounded branch,
   add: if `grounded && supportNormal.y < 0.7`, apply
   `impulse = scale(supportNormal, -carMass * 3.25 * dt)` (reuse
   `RL_CONSTANTS.stickyAcceleration`) — keeps the suspension loaded on walls/fillets.
   Gate it so it does **not** apply during dodge (`dodgeState === "none"` branch is the
   right place).

**Visual change (`StadiumGeometryFactory.ts`):** add `createWallFillets(context)` —
quarter-cylinder strips matching the physics arcs. Use
`THREE.CylinderGeometry(R, R, length, 12, 1, true, thetaStart, Math.PI/2)` rotated so
the curved face is concave toward the field, positioned with axis along the wall
length at the arc centre line; material: the **floor** material (so the fillet reads as
floor curving up); or a dedicated opaque dark material — pick one, no z-fighting with
the floor (start the strip at the fillet tangent line `x = -(halfWidth - R)`, ending the
flat floor's visual reliance there is unnecessary since the fillet overlaps on top of
the floor box; overlap is fine because the fillet strip is above the floor surface for
θ>0). Add it for the same runs as the physics fillets. Cylinder theta math is fiddly —
after implementing, verify orientation with the Playwright screenshot in WS10 rather
than by reasoning alone.

**Tests (new `tests/unit/wallDriving.spec.ts`):**
1. **Smooth transition:** box-arena; place car at (−halfWidth + 8, 0.4, 0) facing −X
   (toward left wall — set spawn rotation via WS7's rotation support, or steer there),
   full throttle + boost; run 360 ticks. Assert (a) car reaches `position.x <
   -(halfWidth - 1.5)` with `position.y > 2` (it climbed the wall), (b) `grounded` is
   true for ≥ 70% of ticks between first fillet contact and the end, (c) per-tick
   |Δ(linvel)| never exceeds 12 m/s (no violent pop — with 120Hz ticks a hard corner
   hit would spike far higher).
2. **Wall driving holds:** using `spawnCar` with a rotation (WS7 adds it): spawn the
   car already on the left wall — position `(-halfWidth + 0.4, 5, 0)`, rotation =
   quaternion rotating local up (0,1,0) to (1,0,0) and local forward to (0,0,-1)
   (compose axis-angle about z by -90°); throttle 1 for 240 ticks. Assert the car stays
   within 1.0m of the wall plane the whole time and its z advances by > 8m (it drove
   along the wall, stuck to it).
3. **Slow car peels off:** same spawn, throttle 0: within 240 ticks the car's x exceeds
   `-halfWidth + 2` (it fell off — wall-stick must not be glue).

### WS5.D Boost pads seated on the floor

**Root cause:** `src/integration/BoostPadRenderBinding.ts:37` places the visual group at
`pad.position` — the **sensor centre**, which sits `pickupHalfHeight` above the floor
(`BoostPadLayout.ts` line ~26: `y: floorTopY + SMALL_PAD_SENSOR.pickupHalfHeight`). The
plate then adds its own +0.03, so every pad floats.

**Change:** `visual.position.set(pad.position.x, 0, pad.position.z);` — pad visuals are
authored floor-relative (`BoostPadVisualFactory` plate at y=0.03 etc.). If any pads are
ever off-floor in future the binding can subtract the sensor half-height instead; add
that as a comment.

**Test:** extend `tests/unit/boostPads.spec.ts` — construct `BoostPadRenderBinding`
with the real pad observations (headless PhysicsFacade) and a stub asset factory
returning `new THREE.Group()` per pad (three works in Vitest), run one
`updateRenderFrame`, assert every visual group's `position.y === 0`.

---

## WS6 — Opponent AI: simplify, score, never wall-hug

**Problem:** AI drives briefly then pins itself against a wall forever; overall it
should be a simple, reliable ball-chaser that lines up shots and can actually score.

**Approach:** keep the class shell, public API, difficulty/perception plumbing and
kickoff logic of `src/ai/OpponentAiController.ts` (tests depend on `setSeed`,
`setDifficulty`, `getDebugState().targetPosition`, and reaction-delay behaviour —
`tests/unit/aiDifficulty.spec.ts` measures reaction lag through `targetPosition`).
Replace the *planning core* (the tactical mode selection + all its helpers) with a
minimal chase-and-shoot planner plus stuck recovery.

**New planning core (runs on the existing `nextPlanTick` cadence; keep perception
delay + noise application exactly as now):**

```
1. shotDir   = normalize(flat(targetGoalCentre - ballPos))
2. approach  = ballPos - shotDir * (ballRadius + 1.3)     // point behind ball, on the shot line
3. wrongSide = dot(shotDir, normalize(flat(ballPos - carPos))) < -0.15
   // car is between ball and the goal it's attacking → looping needed
4. if wrongSide: target = ballPos - shotDir * 6 + perp(shotDir) * 5 * sideSign
   // sideSign = sign(dot(perp(shotDir), carPos - ballPos)) — loop around the near side
   else:        target = approach
5. input = driveTowardPoint(car, target, { boostAllowed: aligned && far })
6. jump: if distToBall < 3.5 && ball.y > 1.3 && ball.y < 3 → jump held 1 tick
   (keep the existing jump-trigger constants)
```

Clamp `target` inside the arena bounds minus 1.5m margin (prevents planning into
walls). Keep the existing mistake/humanisation hooks if trivial to retain, otherwise
delete them and note it in `docs/ai-calibration-log.md`.

**Stuck recovery (new, in the controller — this is the headline fix):**

```
// fields: stuckTicks = 0, unstuckTicksRemaining = 0, unstuckSteer = 0
if unstuckTicksRemaining > 0:
    unstuckTicksRemaining -= 1
    return { throttle: -1, steer: unstuckSteer, ... }   // reverse away, steering to swing nose toward ball
if commandedThrottle > 0.5 && car.speed < 1.0: stuckTicks += 1 else stuckTicks = 0
if stuckTicks >= 90:                       // 0.75s of pushing without moving
    stuckTicks = 0
    unstuckTicksRemaining = 84             // 0.7s of reversing
    unstuckSteer = -sign(headingErrorToBall)  // reversing with opposite steer swings the nose toward the ball
```

Also treat "airborne against wall" via the existing recovery path (unchanged).
`getDebugState().mode` should report `"unstuck"` while reversing (extend
`AiTacticalMode` union in `src/ai/AiTypes.ts`).

**Tests:**
1. **`tests/unit/aiScoring.spec.ts` — AI scores an open net:** box-arena; AI car at
   (0, 0.4, 10) facing +Z (rotation support from WS7), ball at (0, ballRadius, 18),
   opponent goal at +Z end; medium difficulty, seed 7; drive the AI loop (as
   `opponentAi.spec.ts` does) for ≤ 2400 ticks (20s). Assert a `goal-scored` event for
   the AI's team occurs. Repeat with ball offset (3, ·, 16) — angled approach — same
   assertion, budget 3600 ticks.
2. **`tests/unit/aiUnstuck.spec.ts` — never pinned:** spawn AI car 0.6m from the left
   wall facing it (rotation support), ball at centre; run 1200 ticks. Assert:
   (a) at least one window ≥ 60 consecutive ticks with `mode === "unstuck"` OR the car
   simply never satisfies the stuck predicate; and (b) — the real gate — there is **no
   360-tick (3s) window in which the car's position moves < 0.5m in total**. Track a
   rolling window in the test.
3. **Regression:** `tests/unit/aiDifficulty.spec.ts` (reaction lag via
   `targetPosition`) and `tests/unit/opponentAi.spec.ts` must pass — if the latter
   asserts specific tactical modes that no longer exist, update it to the new,
   smaller mode set (read it before rewriting the planner so you keep the semantics it
   measures). Playwright `tests/ai/*.spec.ts` (moves on its own; idle before GO;
   difficulty switch) must stay green untouched.

---

## WS7 — Gameplay correctness fixes

### WS7.A Cars spawn facing the wrong way (+ spawn rotation support)

**Root cause:** `SpawnCarOptions.transform` is position-only; `spawnCar`
(`PhysicsFacade.ts:227`) never sets a rotation, so both cars face local forward = −Z.
The player spawns at negative z (own goal side) and therefore stares into its own goal.
Spawn positions `(-6,1,-10)`/`(6,1,10)` (GameRuntime initial) and
`DEFAULT_CAR_SPAWNS` (kickoff, `PhysicsFacade.ts:42`) are also not RL-like.

**Change:**
1. Extend `SpawnCarOptions` (in `src/physics/PhysicsTypes.ts`) with optional
   `rotation?: QuatLike`; apply via `RigidBodyDesc.dynamic().setRotation(rotation)`
   when present.
2. Replace `DEFAULT_CAR_SPAWNS` with position+rotation entries:
   - index 0 (player): position `(0, 0.35, -24)`, rotation = yaw **π** about Y, which
     as a quaternion is `{x: 0, y: 1, z: 0, w: 0}` (sin(π/2)=1, cos(π/2)=0) → local −Z
     forward becomes +Z, facing the ball. Verify with the test below, not by eye.
   - index 1 (opponent): position `(0, 0.35, 24)`, identity rotation (faces −Z ✓).
   Feed the rotation through `resetWorld`'s spawn loop (`PhysicsFacade.ts:313`).
3. `GameRuntime.initialise` (lines ~227-228) initial spawns: change to the same two
   spawn poses (import the constant or duplicate the literal with a comment).
4. `AssetPipeline.buildPlaceholderWorld` presentation cars (lines ~243-249): player car
   currently un-rotated at (-6,·,-10) and opponent rotated π at (6,·,10) — swap to
   match: player gets `rotation.y = Math.PI`, opponent gets 0, or simply place them at
   the new kickoff poses for consistency.

**Test (extend `tests/unit/matchFlow.spec.ts` or `physicsFacade.spec.ts`):** after
`resetWorld({ carCreationOrder: [player, opponent] })`, for each car assert
`dot(carForwardWorld, normalize(ballPos - carPos)) > 0.95` (both face the centred
ball). This single assertion catches both position and rotation mistakes.

### WS7.B Auto-flip when stranded upside down

**Change:** new per-car runtime field `invertedSeconds` (in `CarRuntimeState.ts`,
reset on spawn). In `PhysicsFacade`'s per-tick car loop (after `postPhysicsTick`):

```
up = carUpWorld
if (up.y < -0.35 && speed < 2.0 && angularSpeed < 2.0 && !grounded) invertedSeconds += dt
else invertedSeconds = 0
if (invertedSeconds >= 1.0):
    yaw = extract current yaw (atan2 of flatForward)
    body.setRotation(quaternionFromYaw(yaw + π? — no: same yaw, just upright), true)
      // upright quaternion with the same heading: yawOnly = quatFromAxisAngle(UP, yaw)
    body.setTranslation({x, y: y + 0.5, z}, true)
    body.setAngvel(0,0,0); keep linvel
    invertedSeconds = 0
```

Careful with yaw extraction when the car is inverted: compute heading from
`flat(carForwardWorld)`; if its length < 0.1 (car pointing straight up/down), fall back
to yaw 0. Note in `docs/physics-deviations.md` that RL has no auto-flip (players dodge
out) — this is a deliberate product deviation requested for this game.

**Test (`tests/unit/autoFlip.spec.ts`):** spawn car with rotation = roll π (upside
down), position y = 0.6, zero velocity; step 300 ticks: assert by tick 150 (~1.25s)
the car's `up.y > 0.9`, and by tick 300 it is `grounded`. Second case: car upside down
but sliding at 5 m/s — assert **no** auto-flip occurs before it slows (invertedSeconds
gate on speed).

### WS7.C Ghost cars & ball in the starting locations

**Root cause:** `AssetPipeline.buildPlaceholderWorld` (lines ~229-252) adds a static
presentation ball + two static cars; `GameRuntime.initialise` adds this group to the
scene once (line ~220) and it stays visible forever alongside the live
`PhysicsRenderBinding` visuals.

**Change:**
1. In `buildPlaceholderWorld`, put the ball + two cars in a subgroup named
   `"MenuPresentation"` (stadium + starfield stay in the root).
2. `GameRuntime`: keep a reference to the returned root; on every app-state change
   (there is an existing `syncAppStateFromMatchFlow` / `runtime:app-state-changed`
   path — hook where the state transitions are already computed), set
   `menuPresentation.visible = (appState === "MENU")`.
3. Add facade + test API: `runtime.isMenuPresentationVisible(): boolean`, exposed on
   `window.__GAME_TEST__.runtime` via `src/testing/TestApiInstaller.ts`.

**Test (Playwright, extend `tests/game-flow/match-flow.spec.ts`):** at boot (menu):
`isMenuPresentationVisible() === true`; start a match, poll to PLAYING:
`=== false`; return to menu: `=== true` again.

### WS7.D Particles never disappear

**Root cause:** `VfxModule.uploadBuffers` (`src/vfx/VfxModule.ts` ~line 295) sets
`size = 0` for inactive particles but leaves their last position in the buffer.
`gl_PointSize = 0` is clamped to 1px on most GPUs, and with additive blending those
1px points remain visible forever at each particle's final position.

**Change:** in `uploadBuffers`, for inactive particles also write
`positionAttr.setXYZ(i, 0, -10000, 0)`. Belt-and-braces: in the fragment shader add
`if (vColor.r + vColor.g + vColor.b < 0.001) discard;` — no: cleaner to pass size:
add `varying float vSize;` set from the `size` attribute in the vertex shader and
`if (vSize <= 0.0) discard;` at the top of the fragment shader.

**Test (extend `tests/unit/vfxModule.spec.ts`):** spawn a burst (call the module's
detect path or invoke `spawn` via a goal-celebration transition as the existing spec
does), step past `maxLife` with repeated `updateRenderFrame` calls, then read
`geometry.getAttribute("position")` and assert every inactive index has y === -10000,
and `getActiveParticleCount() === 0`.

---

## WS8 — Graphics: kill the wobble, dress the floor

### WS8.A Remove vertex jitter (z-fighting)

**Change:** in `src/visual-language/PsxRenderSettings.ts` set `jitterEnabled: false`
in **all three** presets (`authentic`, `balanced`, `clean`). Leave the shader
infrastructure, the accessibility "reduced jitter" toggle (now a no-op — it already
composes as `base.jitterEnabled && !reducedJitter`), and `VertexJitter.ts` in place.
Record in `docs/visual-language-deviations.md`: jitter removed product-wide due to
z-fighting; infrastructure retained.

Also fix the independent marking z-fight: in `StadiumGeometryFactory.ts` raise
`MARKING_HEIGHT_OFFSET` from 0.011 → **0.02** and give the marking material
`depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2`.

**Tests:** grep `tests/` for `jitterEnabled` — `tests/ui/settings.spec.ts` asserts the
accessibility toggle drives `settings.jitterEnabled` to `false` (still true: base false
stays false — verify the assertion direction; if it asserts a *change* from true→false,
update it to assert the diagnostic is false before and after).
`tests/unit/psxVisualLanguage.spec.ts` may assert preset tables — update expected
`jitterEnabled` values there. Run `tests/visual-language/psx-pipeline.spec.ts` to
confirm no shader errors.

### WS8.B Floor texture pass

**Goal:** replace the single tiled concrete floor with a paneled floor built from the
supplied textures (`public/assets/textures/…`, all already registered in
`src/assets/textures/TextureManifestData.ts`) for visual interest, PS1-style.

**Change:**
1. Find the manifest ids for: `ConcreteFloor-01_64.png`, `ConcreteFloor-02_64.png`,
   `Grid-001_Base-002.png`, `ConcreteFloorPainted-C16x32B_64.png`,
   `ConcreteFloorPainted-C16x32R_64.png` (grep `TextureManifestData.ts` for the
   filenames; ids are derived from them). Extend the stadium-texture loading path
   (`AssetPipeline` currently provides `stadiumTextures.floor/wall` — follow how
   `floor` is loaded through `TextureAssetLoader` and load these five the same way into
   a `stadiumTextures.floorSet: THREE.Texture[]` + `accentBlue`/`accentRed`).
2. In `StadiumGeometryFactory.createStadiumBlockout`, replace the floor box's single
   material with a **paneled top**: keep the opaque floor box (dark base colour, no
   map) for the sides/underside, then lay a grid of `PlaneGeometry` panels (4×6 grid of
   10×10m panels) at y = 0.005, each assigned one of the two concrete textures chosen
   via `SeededRandom` (seed from `context` — the procedural context already carries a
   seed; reuse the existing pattern from other factories, e.g. starfield). Rotate each
   panel's UV by 0/90/180/270° (set `texture.rotation` requires cloned textures — 
   instead rotate the plane mesh around Y by k·π/2, which is free). Panels within 10m
   of each goal use the painted accent texture (`…B` blue-ish on the player half,
   `…R` on the opponent half — matches the cyan/magenta team language well enough).
   Use `NearestFilter` + `SRGBColorSpace` if the loader doesn't already
   (`TextureAssetLoader` sets defaults — check and follow its conventions).
   Budget: ≤ 30 extra draw calls (24 panels + accents); acceptable. Alternative if
   draw calls matter: group panels by texture into merged geometries — only do this if
   trivially achievable with `BufferGeometryUtils.mergeGeometries` (available in
   three 0.160 examples — `three/examples/jsm/utils/BufferGeometryUtils.js`).
3. Floor markings (centre line/circle/goal boxes) stay on top (offset already raised in
   WS8.A).

**Tests:** extend the WS5.A `getStadiumShellInfo` hook with `floorPanelCount`; assert
`≥ 20`. Asset regression: `tests/assets/texture-visual.spec.ts` ("floor and walls
render with a real supplied texture, not flat placeholder colour") — read it; it likely
samples material maps; the floor path must still expose textured materials
(it will), but the **wall** half of the assertion now points at a hex-pattern canvas
texture — if it requires a *supplied* (manifest) texture on walls, update it to check
the floor only + shell transparency, documenting why.

---

## WS9 — UI restyle: PS1 Wipeout character

**Goal:** de-generic the menus/HUD. Keep every `data-testid` and every visible label
string exactly as-is (release-gate + suites select on them). This is CSS + minor
template wrappers only — no behavioural changes, no new dependencies, **no remote
fonts** (runtime assets must be local).

**Change:**
1. New stylesheet `src/styles/retro-ui.css`, imported once in `src/main.ts` (or
   `App.vue` style, non-scoped). Define CSS custom properties:
   `--ui-cyan: #4ff0ff; --ui-magenta: #ff5fd8; --ui-amber: #ffc65f; --ui-bg: rgba(8,6,18,0.82); --ui-font: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;`
   plus utility classes:
   - `.wo-panel`: angled corner-cut container —
     `clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));`
     1px inner border via `box-shadow: inset 0 0 0 1px rgba(79,240,255,0.35)`,
     background `var(--ui-bg)`.
   - `.wo-title`: uppercase, `font-style: italic`, `transform: skewX(-8deg)`,
     `letter-spacing: 0.28em`, dual chromatic shadow
     `text-shadow: 2px 0 rgba(255,95,216,0.55), -2px 0 rgba(79,240,255,0.55)`.
   - `.wo-item`: menu row — left accent bar (`border-left: 3px solid var(--ui-cyan)`),
     skewed hover slide (existing MainMenu already translates on hover — keep),
     background gradient `linear-gradient(90deg, rgba(79,240,255,0.10), transparent 60%)`.
   - `.wo-scanlines`: full-screen overlay,
     `background: repeating-linear-gradient(0deg, rgba(0,0,0,0.14) 0 1px, transparent 1px 3px); pointer-events: none; mix-blend-mode: multiply;`
2. Add one `<div class="wo-scanlines" aria-hidden="true">` overlay in `App.vue` above
   the HUD/menu layer (below dialogs). It must not intercept events
   (`pointer-events: none`).
3. Apply classes across `src/components/menu/MainMenu.vue`, `MatchSetup.vue`,
   `SettingsPanel.vue`, `src/components/hud/PauseMenu.vue`, `ResultsScreen.vue`,
   `GameplayHud.vue`, `CountdownOverlay.vue`, `GoalBanner.vue`, `OvertimeBanner.vue`:
   swap the plain monospace-box look for `.wo-panel`/`.wo-title`/`.wo-item`, keep
   layout and all test hooks. HUD specifics: scoreboard becomes a winged centre plate
   (clip-path chevrons using the amber/cyan/magenta split like the reference shots:
   player score cyan-boxed, timer centre, opponent magenta-boxed); boost gauge gets a
   circular conic-gradient ring (`background: conic-gradient(var(--ui-amber) calc(var(--boost)*1%), rgba(255,255,255,0.08) 0)`
   with a CSS var bound via `:style` to the existing boost value) — the numeric
   readout stays.
4. Countdown/GO and GOAL banners: big skewed italic with the chromatic shadow, brief
   CSS scale-in (`@keyframes` pop, 150ms) — CSS-only.

**Tests:** the entire existing Playwright UI/flow suite is the regression gate (it
selects by testid/text only). Add one smoke assertion to
`tests/ui/settings.spec.ts`-style file or `tests/smoke/boot.spec.ts`: the scanline
overlay exists and has `pointer-events: none`
(`getComputedStyle(document.querySelector('.wo-scanlines')).pointerEvents === 'none'`),
proving it can't eat clicks. Manual screenshot review in WS10.

---

## WS10 — Final integration pass & release gate

1. Full verification block (§0.1) — everything green on both projects.
2. `npm run test:release` — green (plain build, no debug hooks, no external requests).
3. **Screenshot QA** (Playwright, ad hoc — not committed as assertions): capture
   `page.screenshot()` at: main menu, match setup, countdown, mid-match normal cam,
   mid-match ball cam, car near wall (camera through-wall check), goal mouth close-up,
   pause menu, results screen. Eyeball each against this plan's intent (car
   bottom-centre & close; transparent hex walls with visible starfield; enclosed goal;
   pads seated; fillets look curved; no floating ghost cars; no z-fighting shimmer;
   Wipeout-styled UI). Fix what's obviously wrong; re-run affected suites.
4. Manual feel pass in the dev server (`npm run dev`): drive, turn, release-turn,
   powerslide, jump, front-flip, wall drive, score, get scored on, pause, replay.
   The tests gate the numbers; this pass gates the *feel*. Adjust only the WS2/WS3/WS4
   tunables if needed, then re-run their unit suites (they have ±tolerances designed to
   survive small tuning).
5. Update `docs/implementation-progress.md` (mark this plan complete, list deviations),
   `docs/build-decisions.md` (one entry summarising the overhaul), and each area's
   deviations doc.
6. Final commit + push.

---

## Appendix A — New/changed constants summary

| Location | Key | Value |
|---|---|---|
| `CameraConstants.ts` | distance / height / fov / angleDegrees | 2.75 / 1.1 / 77 / −4 |
| `CameraConstants.ts` | positionSmoothingRate / yawSmoothingRate / targetSmoothingRate | 11 / 8 / 30 |
| `CameraConstants.ts` | ballCamCarBias / minHeightAboveFloor | 0.15 / 0.35 |
| `PhysicsParameters.ts` | grip.normalRate / normalMaxAcceleration | 40 / 90 |
| `PhysicsParameters.ts` | steering.response / maximumYawAcceleration | 30 / 60 |
| `DodgeController.ts` | FLIP_RATE | 2π / activeDuration (≈9.67 rad/s) |
| `TestArenaPresets.ts` | FILLET_RADIUS / SEGMENTS / SEG_HALF_THICK | 2.0 / 5 / 0.12 |
| `PhysicsFacade.ts` | DEFAULT_BALL_SPAWN.y | ballRadius (0.9125) |
| `PhysicsFacade.ts` | DEFAULT_CAR_SPAWNS | (0,0.35,−24) yaw π / (0,0.35,24) yaw 0 |
| auto-flip | invert threshold / dwell | up.y < −0.35 & speed < 2 / 1.0s |
| AI stuck | detect / reverse | 90 ticks @ speed<1 / 84 ticks reverse |

## Appendix B — Test inventory added by this plan

| File | Kind | Gates |
|---|---|---|
| `tests/unit/steeringDirection.spec.ts` | Vitest | WS1.A |
| `tests/unit/gamepadInput.spec.ts` | Vitest | WS1.B |
| `tests/unit/drivingFeel.spec.ts` | Vitest | WS2 |
| `tests/unit/dodgeFlip.spec.ts` | Vitest | WS3 |
| `tests/camera/rl-framing.spec.ts` | Playwright | WS4 |
| `tests/unit/goalIntegrity.spec.ts` | Vitest | WS5.B |
| `tests/unit/wallDriving.spec.ts` | Vitest | WS5.C |
| `tests/unit/boostPads.spec.ts` (extended) | Vitest | WS5.D |
| `tests/unit/aiScoring.spec.ts` | Vitest | WS6 |
| `tests/unit/aiUnstuck.spec.ts` | Vitest | WS6 |
| `tests/unit/matchFlow.spec.ts` (extended) | Vitest | WS7.A |
| `tests/unit/autoFlip.spec.ts` | Vitest | WS7.B |
| `tests/game-flow/match-flow.spec.ts` (extended) | Playwright | WS7.C |
| `tests/unit/vfxModule.spec.ts` (extended) | Vitest | WS7.D |
| `tests/visual-language/arena-shell.spec.ts` | Playwright | WS5.A / WS8.B |
| existing full suites | both | every WS regression |

## Appendix C — Known existing tests that will need updating (expected, not regressions)

- `tests/camera/chase-camera.spec.ts` — arena-bounds tolerance, FOV/distance pins (WS4).
- `tests/physics/foundation.spec.ts` — ball-drop test must spawn its own elevated ball (WS5.B).
- `tests/unit/psxVisualLanguage.spec.ts` / `tests/ui/settings.spec.ts` — jitter expectations (WS8.A).
- `tests/assets/texture-visual.spec.ts` — wall-texture assertion moves to floor-only (WS8.B).
- `tests/unit/opponentAi.spec.ts` — tactical-mode names if asserted (WS6).
- `tests/unit/carController.spec.ts` — only if it pins soft-tuning numerics (WS2).

Anything else that breaks is a real regression — fix the code, not the test.
