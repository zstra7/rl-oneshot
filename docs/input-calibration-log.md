# Input Calibration Log

## Post-launch polish pass — R10 (rebindable controls + air-roll sensitivity, plan/RAMPS_AND_FEATURES_PLAN.md)

- **Rebindable controls, fully live**: a new `ControlBindings` model
  (`src/input/bindings/BindingsConfig.ts`, `DEFAULT_CONTROL_BINDINGS`) covers
  every keyboard/mouse/gamepad gameplay action. `jump`/`boost`/`rearView` are
  a `KeyOrMouseBinding` union (`{kind:"key",code}` or `{kind:"mouse",button}`)
  rather than mouse-only slots, so "rebind jump to a key" — a common request —
  isn't structurally forbidden. UI-navigation keys (`uiUp`/`uiDown`/etc.) are
  **not** part of this surface and stay fixed, as spec'd. `InputControlsModule`
  now holds `private bindings: ControlBindings` (`setBindings`/`getBindings`)
  and every previously-hardcoded `DEFAULT_KEYBOARD_BINDINGS`/
  `DEFAULT_MOUSE_BINDINGS`/`DEFAULT_GAMEPAD_BINDINGS`/`POWERSLIDE_*` reference
  in the gameplay-input path (including the easy-to-miss literal `"Space"`/
  `"Escape"` checks in `handleKeyboardPress`) now reads `this.bindings.*`.
- **Gamepad air-roll semantic trap, fixed while refactoring**: before R10,
  `DEFAULT_GAMEPAD_BINDINGS.airRollModifierButton` was `leftTrigger`, but
  `buildLogicalStateFromGamepad` never read it — it deliberately read
  `powerslideButton` (west) instead, so braking mid-air wouldn't accidentally
  turn stick input into roll (see the WS1 entry above). Had the old rebind-UI
  sketch simply displayed and let players rebind `airRollModifierButton`, the
  binding would have appeared completely dead — any rebind of it would change
  nothing, because the code path consuming air-roll input never looked at it.
  Fixed at the root: `buildLogicalStateFromGamepad` now consumes
  `bindings.gamepad.airRollModifierButton` directly, and its *default* changes
  from `leftTrigger` to `west` (2) — the same value `powerslideButton` already
  had — so default behaviour is bit-for-bit unchanged (confirmed by
  `tests/input/foundation.spec.ts` passing unmodified) while the binding the
  rebind UI shows is now the one actually driving the game. Duplicate values
  across different actions (e.g. `airRollModifierButton === powerslideButton`)
  are legal and expected, not a bug — the UI hints at them with an amber tint
  rather than blocking. `tests/input/rebinding.spec.ts` pins both the default
  (`west`/`BTN 2`) and the actual consumed behaviour (west + stick-left while
  airborne produces roll).
- **Rebind capture**: `InputControlsModule.startBindingCapture(device)` /
  `cancelBindingCapture()` / `takeCapturedBinding()`. While armed for
  `"keyboardMouse"`, the next keyboard or mouse press is captured *and
  suppressed* from the normal action-edge queues (so rebinding accelerate to
  `P` doesn't also fire a stray edge into whatever `P` used to do — nothing,
  today, but the suppression is unconditional so it can't regress later). The
  settings-panel UI additionally runs its own component-local, capture-phase
  `window` keydown/mousedown listeners (with `preventDefault`) so it can
  render "PRESS A KEY…" and the resolved value immediately; both layers see
  the same real DOM event, and only the module's capture-suppression prevents
  it from also being processed as gameplay input. Gamepad capture reuses the
  existing `pollGamepad` button-edge loop and is polled by the settings panel
  every 100 ms via `takeCapturedBinding()`.
- **Air-roll sensitivity, physics-real**: `CarControlProfile.
  airRollSensitivity` (`DEFAULT_AIR_ROLL_SENSITIVITY = 1.0`, clamped to
  [0.5, 2.0] by `InputControlsModule.setAirRollSensitivity`) is threaded
  through the per-tick `carControlProfile` into `PhysicsFacade.
  setCarControlProfile` exactly like `dodgeDeadzone` already was. `Aerial
  Controller.applyAerialRotation` multiplies only
  `RL_CONSTANTS.maxRollAngularAcceleration` by it — pitch and yaw are
  untouched — so it scales actual rotational acceleration for both digital
  (`roll: ±1`) and analog stick input, not a cosmetic UI-only curve.
  `createCarEntity` initialises the field to the default so pre-R10 car-
  creation call sites never see `undefined`. `tests/unit/
  airRollSensitivity.spec.ts` pins the physical effect directly (0.6 vs 1.8
  sensitivity on identical `roll: 1` input produces >1.5x more accumulated
  angular speed within 30 ticks, well below the ~3x actually observed at that
  sensitivity ratio).
- Settings persistence: `settingsStore`'s new `controls` section validates
  field-by-field like every other section (bad key codes/out-of-range
  button indices/malformed `KeyOrMouseBinding` unions fall back to the
  matching default field, not the whole section) — see
  `tests/unit/controlBindings.spec.ts`.

## Post-launch polish pass — R11 (controller menu navigation, plan/RAMPS_AND_FEATURES_PLAN.md)

- **Fixed (non-rebindable) console-convention mapping**: gamepad d-pad/
  left-stick now moves DOM focus through whichever `[data-menu-root]`
  screen is visible (MainMenu, MatchSetup, SettingsPanel, PauseMenu,
  ResultsScreen), South (`STANDARD_GAMEPAD_BUTTONS.south`) activates the
  focused element, East triggers the screen's `[data-menu-back]`. This is
  deliberately *not* part of the R10 `ControlBindings` rebinding surface —
  console UX convention, same reasoning as the already-fixed UI-navigation
  keys.
- **Three classic polling-input double-action leaks, each closed with its
  own mechanism** (all four are gated by
  `tests/ui/controller-navigation.spec.ts`'s "anti-double-trigger" tests):
  1. *Single consumption point*: `InputControlsModule.
     sampleMenuNavigation()` clears its own `confirmPressed`/`backPressed`
     edge flags on read, and is called exactly once per rendered frame
     (`GameRuntime.emitMenuNavigationFrame`, mirroring the existing
     "`pollGamepad` runs exactly once per browser frame" invariant) — one
     physical press produces exactly one `confirmPressed`, regardless of
     how many frames it stays held, because a *new* edge still requires a
     full release first (same rising-edge detection `pollGamepad` already
     used for gameplay edges).
  2. *Stick hysteresis*: `up`/`down`/`left`/`right` "held" states from the
     left stick engage at `|axis| > 0.5` and release only below `0.35`
     (`axisHysteresis` in `InputControlsModule.ts`) — a stick resting
     right at a single threshold value can't oscillate held/released
     across frames and machine-gun the focus. Held-repeat timing itself
     (`useMenuGamepadNavigation.ts`): first move immediate, then a 380ms
     delay, then repeats every 140ms.
  3. *Edge quarantine across context switches*: `InputControlsModule` now
     tracks `gameplayEdgesEnabled`/`menuEdgesEnabled` flags, set once per
     frame by `GameRuntime.applyMenuNavigationGates()` from
     `matchFlow.areControlsActive()` / the new `MENU_NAVIGABLE_STATES`
     list (`MatchFlowTypes.ts`). `pollGamepad`'s South/East rising edges
     only ever populate *one* of two completely separate queues — the
     existing gameplay `pendingEdges` array (JUMP/BALL_CAMERA/PAUSE) or
     the new menu confirm/back booleans — gated by these flags, which are
     never simultaneously true for any real match state. Without this, a
     South press to click RESUME on the pause menu would leave a queued
     gameplay JUMP edge that fires the instant play resumes (pre-R11, the
     pause-menu early return in `GameRuntime.onFixedTick` already meant
     such edges sat queued rather than being dropped, then got consumed
     the moment gameplay sampling resumed — this is the literal root
     cause the quarantine removes). Keyboard/mouse gameplay edges are
     unaffected — this quarantine is gamepad-only, since KB&M has no menu-
     navigation surface to be quarantined from.
  4. *Require-release re-arm on resume*: even with clean edge queues, the
     physics module's own per-car jump edge-detector operates on the
     *held* `CarInput.jump` boolean, not on the edge-queue mechanism above
     — so clicking RESUME with South (=jump on gamepad by default) still
     physically held would make `jumpHeld` read `true` on the very first
     post-resume gameplay tick regardless of any edge-queue fix, and the
     physics side (frozen at `jump:false` across the pause) would see a
     rising edge and jump. `InputControlsModule.rearmGameplayInputs()`
     snapshots every currently-held gamepad button/keyboard code/mouse
     button into three `Set`s and masks each from **gameplay** sampling
     (`keyPressedForGameplay`/`mousePressedForGameplay`/
     `gamepadButton{Pressed,Value}ForGameplay`) until it is individually,
     physically released — each helper drops its own mask entry the
     instant the underlying input reads not-held, so one release re-arms
     permanently rather than leaving anything stuck masked. `GameRuntime.
     applyMenuNavigationGates()` calls `rearmGameplayInputs()` +
     `clearPendingEdges()` on every `areControlsActive()` false→true
     transition (resume from pause today; countdown GO after menus once
     R12/R13 land more menu-navigable states).
- **Ordering bug found and fixed during implementation, not by inspection
  — caught by the "no jump on resume" Playwright gate**: the gating/re-arm
  call was originally placed *after* `FixedStepCoordinator.advance()` in
  `GameRuntime.frame()`. Since the RESUME click itself happens inside that
  same call (via the composable's `runtime:menu-navigation` listener,
  triggered synchronously from `emitMenuNavigationFrame` — itself called
  after `advance()`), the match-state flip to `PLAYING` only becomes
  visible to `applyMenuNavigationGates()` on the *next* rendered frame.
  With gating placed after `advance()`, that next frame would run its
  fixed-tick(s) — and therefore its first post-resume gameplay input
  sample — *before* the re-arm mask was captured, so a still-held South
  jumped the car exactly once on resume before ever getting masked.
  Fixed by moving `applyMenuNavigationGates()` to the *start* of `frame()`
  (before `updateBrowserFrame`/`advance()`), so the re-arm from a
  transition that completed by the end of frame N always runs before
  frame N+1's fixed-tick advance ever samples gameplay input in the new
  state — see the ordering comment at the `frame()` call site.
- `MENU_NAVIGABLE_STATES` (`MatchFlowTypes.ts`) is a small, explicitly
  named list (`MAIN_MENU`/`MATCH_SETUP`/`SETTINGS`/`PAUSED`/
  `MATCH_RESULTS`) rather than `!areControlsActive()` — several states
  (`COUNTDOWN_*`, `GOAL_CELEBRATION`, `OVERTIME_INTRO`, etc.) are also
  controls-inactive but have no `[data-menu-root]` visible, so gamepad
  input there should be neither a gameplay edge nor a menu edge. R12/R13
  extend this same list (`CAR_CUSTOMISE`, `TOURNAMENT_BRACKET`,
  `TOURNAMENT_VICTORY`) rather than each screen inventing its own.

## Post-launch polish pass — WS1 (plan/POLISH_OVERHAUL_PLAN.md)

- **Confirmed and fixed the real "controller does not work at all" bug**:
  `installInputTestApi` (`src/input/testing/BrowserInputTestApi.ts`) ran in
  every `__DEV__` build (i.e. every `npm run dev` session) and
  unconditionally swapped `InputControlsModule` onto a
  `VirtualGamepadProvider` at install time, which never reports any
  connected gamepad until a test explicitly connects one — so
  `navigator.getGamepads()` was never polled again and real hardware was
  completely dead, even outside of any test. Fixed: the virtual provider
  now activates lazily, only on the first `connectVirtualGamepad()` call,
  and `reset()` restores real hardware polling via a new
  `InputControlsModule.useBrowserGamepadProvider()`. A new
  `InputDiagnostics.gamepadProviderKind` field ("browser"/"virtual") makes
  this observable and is gated by a Playwright test
  (`tests/input/foundation.spec.ts`: "real gamepad hardware polling is
  never hijacked by the test API on boot").
- `activeDevice` now also promotes to `"gamepad"` on analog stick/trigger
  activity (`STICK_ACTIVATION_THRESHOLD = 0.35`), not only on a button
  press edge — previously moving the stick alone never activated the pad,
  and any keyboard/mouse touch (including the one-time audio-resume
  gesture) would strand it on `"keyboard-mouse"` until the next pad button
  press.
- Gamepad air-roll/powerslide modifier now reads the dedicated west/X
  button (`DEFAULT_GAMEPAD_BINDINGS.powerslideButton`) instead of the
  reverse/brake trigger — braking mid-air no longer accidentally converts
  stick input into roll.
- Gamepad rear-view now reads the right-stick-click button
  (`DEFAULT_GAMEPAD_BINDINGS.rearViewButton`) when the active device is
  `"gamepad"`, instead of being hardcoded to the mouse middle button only.
- **Ground steering sign was inverted**: `GroundSteeringController`
  mapped `steer:+1` (D key / `steerRight - steerLeft`) to a *leftward*
  turn — the AI's `GroundManeuverController` carried a compensating
  negation with a comment documenting the bug rather than fixing it.
  Fixed at the source (`GroundSteeringController.ts`'s yaw-rate sign) and
  removed the AI's compensation. Pinned with
  `tests/unit/steeringDirection.spec.ts` (cross-product turn-direction
  assertions for both physics and the AI's `driveTowardPoint` output
  sign).

## 2026-07-21 — Phase 4 initial pass

- Default deadzone for gamepad analogue axes set to `0.15` (not spec'd
  numerically for Phase 4 — the spec's own analogue-processing calibration
  work is section 12, deferred). Revisit alongside real gamepad hardware
  testing.
- `GAMEPAD_TRIGGER_ACTIVATION_THRESHOLD = 0.1` for treating an analogue
  trigger as "pressed" for accelerate/reverse/air-roll-modifier purposes.
  Arbitrary starting point, not measured against real hardware.

## Deferred to later phases

The following are explicitly out of scope for Phase 4 (input foundation)
per `plan/MASTER_BUILD_BRIEF.md`'s exit criteria, and per the input
module spec's own phased plan (section 56) sections 4-9 — see
`docs/implementation-progress.md` and the deviations noted in code
comments:

- Binding rebinding UI/flow and persistence (spec sections 15-19, 34-35) —
  Phase 15 (UI and settings polish).
- Full analogue sensitivity/curve calibration (section 12), dodge
  deadzone UI (section 13) — the `CarControlProfile.dodgeDeadzone` field
  exists and defaults to `0.8`, but there is no settings UI yet.
- Haptics (section 36) — `playHapticEffect`/`stopHaptics` are not
  implemented; no consumer needs them until VFX/match-flow events exist.
- Camera swivel, ball-camera/rear-view *behaviour* (sections 28-30) — the
  input module produces `CameraInput` values, but no camera module
  consumes them yet (Phase 8).
- UI navigation repeat timing, input prompt icon system (sections 32-33) —
  Phase 15.
- Input telemetry/performance instrumentation (sections 51-52).
