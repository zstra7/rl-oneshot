# Input Calibration Log

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
