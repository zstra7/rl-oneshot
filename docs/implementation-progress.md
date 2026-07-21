# Current Phase

Phase: 9 — Basic Opponent AI
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/ai/OpponentAiController.ts`: a real opponent AI producing `CarInput`
  for `car-opponent` every fixed tick, replacing the `NeutralOpponentAi`
  placeholder. Implements core architecture spec section 65's ordered
  checklist, one fixed "Medium-like" parameter set (`src/ai/AiConstants.ts`)
  — no difficulty tiers or humanisation yet (Phase 10):
  1. **Ground target driving** (`GroundManeuverController.driveTowardPoint`):
     a heading-error proportional steering controller outputting the
     normalised `throttle`/`steer`/`boost`/`powerslide` the physics
     module's own yaw-rate servo already knows how to consume.
  2. **Recovery** (`computeRecoveryInput`): drives `pitch`/`roll` to
     right an airborne/flipped car via the same `CarInput` channel the
     human aerial controller uses — no special-cased physics path.
  3. **Ball prediction** (`BallPredictor.predictBallTrajectory`): the AI
     spec's explicitly-permitted analytical fallback (gravity + a single
     floor-bounce reflection), not a second Rapier world.
  4. **Reachability** (`Reachability.estimateReachSeconds`): the spec's
     explicitly-recommended flat heuristic (distance/speed + turn
     penalty) — deliberately not an iterative/exact solver.
  5. **Basic intercept**: samples the predicted trajectory for the
     earliest point the AI can reach at or before the ball does.
  6. **Shoot open goal**: approaches from the far side of the ball
     (opposite the target goal) so contact sends it goalward.
  7. **Retreat**: holds a goal-side holding position, loosely shadowing
     the ball's lateral position, when neither attacking nor defending
     nor low on boost.
  8. **Basic defence**: goal-side shadow position between the ball and
     the AI's own goal, triggered by an actual goal-threat (ball heading
     toward the danger zone) or the human being clearly closer/faster.
  9. **Kickoff**: a *committed* state (AI spec section 27) entered on the
     `MatchState` transition into `PLAYING`/`OVERTIME_PLAYING`, not
     re-derived from ball physics every tick (see Known deviations).
  10. **Boost-pad collection**: routes to the nearest active pad
      (preferring full pads when critically low) when boost is low and
      neither attacking nor defending is more urgent, gated by an
      absolute reach-time cutoff so it isn't crowded out by a
      relative-only "faster than human" comparison (see Known deviations).
- `PhysicsFacade` unchanged; AI reads only public `CarSerializableState`/
  `BallSerializableState`/`BoostPadObservation` plus goal-sensor centres
  already exposed for the camera (Phase 8) — no new physics surface.
- `GameRuntime.onFixedTick`: when controls are active, gathers an
  `AiUpdateContext` from live physics/match-flow state each tick and
  applies `OpponentAiController.update()`'s result via
  `physics.setCarInput("car-opponent", ...)`, mirroring exactly how the
  human player's `CarInput` is applied.
- `ModuleContainer.ai` is now the concrete `OpponentAiController` (was
  the generic `GameModule`-typed `NeutralOpponentAi` placeholder).

## Failing
- None. All Phase 9 exit criteria verified locally in this session.

## Deferred
- Difficulty tiers (easy/medium/hard), reaction delay, perception noise/
  history, humanisation/mistake modelling, utility-scored tactical
  planning (possession/threat assessment, candidate scoring), shot
  power/dodge shots, 50/50 planning, boost denial/contested-pad logic,
  wall/ceiling driving, aerial play, and score/time-aware strategy shifts
  — all explicitly AI spec sections beyond core architecture spec section
  65's Phase 9 list; Phase 10 ("AI difficulty and tactics") scope.
- No jump/dodge/aerial decision-making at all (ground-only): not in the
  Phase 9 checklist. The AI will still get airborne from ball/car
  impacts and recovers correctly, it just never *chooses* to jump.
- No canonical `PhysicsEvent` stream exists yet (see
  `docs/physics-deviations.md`), so `AiUpdateContext` omits
  `recentPhysicsEvents` from the full spec section 3 interface, and
  `AiMatchContext.scoreFor/scoreAgainst`/time fields are omitted (score/
  time awareness is AI spec section 35, Phase 10 scope).
- No `getTelemetry()`/`clearTelemetry()`/`setSeed()`/`setEnabled()` from
  the full `OpponentAiModule` public API (spec section 3) — only
  `update()`, `getDebugState()`, `initialise()`, `dispose()` exist.
  Telemetry/seeding are meaningful once difficulty/humanisation (Phase
  10) introduce actual randomness to seed.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 14 files, 103 tests, all passing,
  including a new `opponentAi.spec.ts` (8 tests, real Rapier world, no
  mocking): recovery from a near-exact 180-degree flip, ground driving +
  basic intercept reaching a stationary ball, a shot approach that sends
  the ball toward the target goal (not sideways), goal-side defensive
  shadowing when the ball threatens, kickoff commitment holding even
  while the ball is still settling from its drop, boost-pad collection
  when low and not urgent, retreat holding a goal-side position, and a
  900-tick mixed-scenario run producing only finite `CarInput` values
  (no NaN).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 38 prior tests still pass, plus a new
  `tests/ai/opponent-ai.spec.ts` (2 tests): the AI-controlled opponent
  car visibly moves on its own (no human input at all) once a match goes
  live, and stays idle through the countdown before GO (controls
  neutralised, matching the human player) — 40/40 total on
  `chromium-dev`. Verified visually via a Playwright screenshot of a
  live match with the AI driving unattended.

## Next exact task
- Begin Phase 10 (AI difficulty and tactics) per `plan/MASTER_BUILD_BRIEF.md`
  and the remaining sections of
  `plan/predictive_opponent_ai_module_spec_v1_1_boost_pads.md` not yet
  read in depth: difficulty configuration (section 7), randomness/seeding
  (section 8), humanisation model (section 34), utility-based tactical
  planner refinement (section 16), possession/threat assessment (13-14),
  and score/time awareness (35). Required reading before starting: this
  progress file + those sections (module boundary/API/observation model
  sections are already read from Phase 9). `AiDifficulty`/`setDifficulty`/
  `setSeed`/telemetry are the concrete public-API gaps to fill first.

## Known deviations
- **Kickoff is a committed match-state-driven state, not a per-tick ball-
  physics heuristic.** An earlier version checked "is the ball at rest
  near the centre" every tick — found via ad hoc Vitest debugging that
  this false-negatives while the kickoff-reset ball is still bouncing to
  a stop (its restitution-driven settle can take longer than a real
  countdown). Fixed by tracking the `MatchState` transition into
  `PLAYING`/`OVERTIME_PLAYING` and committing to `kickoff` mode until the
  ball leaves a 3m radius of the centre or a timeout elapses (AI spec
  section 27's own "kickoff state remains committed until..." framing).
- **Attack eligibility needs an absolute time cutoff, not just a relative
  "faster than the human" comparison.** The reachability comparison used
  for both the defence trigger and the attack gate are near-complements
  of each other (`humanReach + margin < aiReach` vs. its negation) — if
  attack were gated purely on "not clearly slower than the human", it
  would fire for every reachable-eventually ball regardless of distance,
  making boost-pad collection and retreat unreachable. Fixed with
  `AI_CONSTANTS.attackReachTimeLimit` (3.5s): found and fixed via ad hoc
  Vitest debugging of a boost-collection test scenario.
- **Recovery needs an explicit rate-damping term, not proportional-only
  control.** A pure `-error * gain` controller on `pitch`/`roll` badly
  overshoots a large initial error (e.g. a full flip): it saturates the
  output for many ticks, builds up real angular momentum, and sails
  straight past upright into a different resting orientation (observed:
  landed on its side instead of settling upright). Fixed by adding a
  damping term proportional to the car's own current local pitch/roll
  rate. Also: an exact 180-degree flip is a genuine unstable equilibrium
  for the proportional error term alone (both `pitch`/`roll` errors
  evaluate to ~0 even though the car is fully inverted) — fixed with a
  symmetry-breaking forced roll while the car's world-space up vector is
  still near-inverted and the proportional terms are near-zero. Both
  found via ad hoc Vitest debugging with periodic orientation logging.
- Carried over from Phase 1-8: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
