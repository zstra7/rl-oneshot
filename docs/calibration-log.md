# Calibration Log

General cross-module tuning notes.

## 2026-07-21 — Phase 5 initial car controller pass

Observed via ad hoc Vitest runs (car settling, driving, boosting,
jumping, dodging, hitting a stationary ball) before writing the final
test suite:

- A freshly spawned car (1 m drop onto the flat/box arena floor) settles
  to `grounded: true`, `wheelContactCount: 4`, `supportNormal ≈ (0,1,0)`
  within roughly 240 ticks (~2 s), with residual pitch angular velocity
  from the spring-damper settling oscillation decaying from roughly
  `-1.3 rad/s` at 60 ticks to `~-0.0005 rad/s` by 240 ticks. Not a bug —
  underdamped-but-stable suspension settling — but worth knowing: tests
  and any future scenario setup should settle for at least ~90 ticks
  before asserting on grounded state or driving, and ideally 200+ ticks
  before precision assertions on rotation/angular velocity.
- Driving at `throttle: 1` from rest reaches ~9.5 m/s after 1 s (120
  ticks), consistent with the throttle-acceleration curve tapering from
  16 m/s² toward zero as speed approaches `noBoostDriveSpeed` (14.1 m/s).
- `throttle: 1, boost: true` for 1 s reaches ~15.5 m/s and fully drains
  the 33 kickoff boost in that time (33 / 33.3 per second ≈ 0.99 s),
  matching the spec's consumption rate.
- First jump delta-v (~2.9-3.3 m/s observed depending on concurrent
  gravity/suspension forces in the same tick) is close to the spec's
  2.92 m/s target.
- Driving a car at a stationary ball with boost produced a clean
  directional hit (ball departed at ~14.5-15 m/s with a modest upward
  pop), confirming the extra-hit impulse (section 27) reads as a
  satisfying Rocket-League-style hit rather than a dead thud.
- No NaN, no divergence, and speed/angular-speed clamps held across a
  20 × 60-tick (10 s) mixed-input stress run with two cars, boost,
  powerslide, steering, and periodic jump/dodge toggling.

Not yet tuned/measured against real playtesting feel: grip/powerslide
response, aerial rotation damping curve, dodge active/recovery timing.
These are starting-point values transcribed directly from the spec
(section 7.2's `DEFAULT_PHYSICS_PARAMETERS`) and are expected to change
once a human plays the build.
