# Input Calibration Log

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
