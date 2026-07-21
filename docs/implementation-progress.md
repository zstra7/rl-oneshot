# Current Phase

Phase: 10 — AI Difficulty and Tactics
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/ai/AiDifficulty.ts`: the AI spec section 7 `AiDifficultyParameters`
  type and the spec's own recommended `EASY_AI`/`MEDIUM_AI`/`HARD_AI`
  presets, all three now wired live via `OpponentAiController.setDifficulty`.
  Not every field is consumed by this project's deliberately-simplified
  planner (no full utility-scored candidate search) — see Known
  deviations for exactly which ones are.
- `src/ai/AiRandom.ts` + `src/ai/PerceptionBuffer.ts`: a seeded PRNG
  (AI spec section 8 — never `Math.random()`) and a per-tick perception
  history that returns the ball/human-car sample from
  `reactionDelaySeconds` ago rather than the instantaneous truth, with
  bounded position/velocity noise applied on top (section 6.2/6.4).
- **Reaction delay + perception uncertainty**: the AI now has a genuine,
  measurable information disadvantage — verified directly by a new test
  that moves the ball unexpectedly and measures ticks until the AI's
  target reacts (hard ~17 ticks, medium ~27, easy ~57, deterministic
  given the delay/cadence parameters).
- **Shadow defence**: `defensiveShadowPosition` now scales shadow
  distance with `defensiveUrgency` (tighter mark at higher urgency).
- **Challenge logic**: the "is the human clearly closer" margin used for
  both the defend-trigger and the attack-gate scales with
  `challengeAggression` — more aggressive difficulties contest 50/50s
  they'd otherwise concede.
- **Clears**: a new `clear` tactical mode, distinct from `defend` —
  triggers when the ball is dangerously close to the AI's own goal
  (within `CLEAR_DISTANCE`), aiming to push it away rather than shadow it.
- **Boost routes**: pad search now uses the difficulty's
  `boostPadAwarenessRadius` (22/60/120m) instead of a single fixed
  constant — a simplification of full route-chaining (see Known
  deviations).
- **Limited jumps / hard-only limited aerials**: the AI jumps when a
  reachable ball is elevated out of ground reach; on hard difficulty
  only, a bounded post-jump airborne pursuit window orients the car
  toward the ball via pitch/yaw instead of immediately falling back to
  plain upright recovery.
- **Humanisation**: a cooldown-gated (2.0/4.0/7.0s by difficulty), bounded
  steering perturbation, evaluated once per "decision cycle" (not every
  120Hz tick) via the seeded PRNG — never touches throttle/boost/goal
  direction, so a mistake can only ever make a turn slightly worse, per
  spec section 34.1's explicit "avoid" list.
- **Tactical replanning is now rate-limited to the difficulty's
  `tacticalHz`** (4/8/12 Hz) instead of recomputing every physics tick —
  low-level driving toward the current planned target still runs every
  tick. This is both a spec-fidelity fix (section 5: "do not recalculate
  tactical state every tick") and a real correctness fix — see Known
  deviations for the bug this uncovered and fixed.
- `MatchSetup.vue`'s "OPPONENT DIFFICULTY" row (a static placeholder
  since Phase 7) is now real: EASY/MEDIUM/HARD buttons wired to
  `runtime.selectAiDifficulty()`, applied live to the running AI.
- `window.__GAME_TEST__.runtime`: `selectAiDifficulty`/`getAiDifficulty`/
  `setAiSeed`/`getAiDebugState` for deterministic Playwright verification.

## Failing
- None. All Phase 10 exit criteria verified locally in this session.

## Deferred
- The full utility-scored candidate-search tactical planner (section 16),
  possession/threat assessment (13-14), 50/50 planning beyond the basic
  challenge-margin adjustment (23), dodge shots/shot power shaping (19.4-
  19.5), boost denial/contested-pad logic (28.8-28.9), route chaining
  (28.5), wall/ceiling driving (33), score/time-aware style adjustment
  (35), and anti-stall detection (36) — not in the master brief's Phase
  10 checklist; would require the full layered planner architecture the
  AI spec describes (section 4's `TacticalPlanner`/`InterceptPlanner`/
  `ShotPlanner`/`DefensivePlanner` class split), which is a much larger
  undertaking than this phase's scope.
- `getTelemetry()`/`clearTelemetry()`/`setEnabled()` from the full
  `OpponentAiModule` public API (spec section 3) still don't exist —
  telemetry recording has no consumer yet.
- Own-car-state delay (`ownStateDelaySeconds`) is not modelled — only
  ball/human-car perception is delayed.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 15 files, 110 tests, all passing,
  including a new `aiDifficulty.spec.ts` (7 tests): difficulty getter/
  setter round-trip, statistical reaction-lag ordering (hard < medium <
  easy, verified across 5 seeds each with hard never reacting on the
  exact same tick as a surprise event — "not omniscient"), same-seed
  determinism, clear-vs-shadow-defence mode selection, bounded/finite
  humanisation mistakes across a 900-tick run, the limited-jump trigger,
  and hard-only airborne pursuit. All 8 prior `opponentAi.spec.ts` tests
  (Phase 9) still pass unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 40 prior tests still pass, plus a new
  `tests/ai/ai-difficulty.spec.ts` (3 tests): the match setup screen
  shows all three difficulty buttons with medium selected by default,
  selecting a difficulty takes effect immediately on
  `window.__GAME_TEST__.runtime.getAiDifficulty()`, and a hard-difficulty
  AI still drives itself with finite state through a live match — 43/43
  total on `chromium-dev` and `chromium-preview`. Verified visually via
  Playwright screenshots of the new difficulty selector and a live hard-
  difficulty match.

## Next exact task
- Begin Phase 11 (user car GLB integration) per `plan/MASTER_BUILD_BRIEF.md`
  and the relevant sections of `plan/asset_production_pipeline_module_spec.md`
  covering authored car model intake. A real `assets/models/car.glb` is
  already present in the repo but unused — `ProceduralCarFallback` is
  still what renders both cars. Required reading before starting: this
  progress file + the asset pipeline spec's car/GLB intake, validation,
  and fallback sections (not yet read in depth). Do not touch texture
  intake (Phase 12) or PSX post-processing (Phase 13) yet.

## Known deviations
- **Real bug found and fixed: recomputing the noisy, multi-second-horizon
  ball trajectory prediction fresh every single 120Hz tick destabilised
  steering into a wide, non-converging arc.** Found via an isolated ad
  hoc Vitest test that made the AI chase a ball with any lateral (X-axis)
  offset from its spawn — the car would sail past the target and off
  toward a wall instead of converging, something none of the Phase 9
  tests (which all happened to use ball positions directly ahead, no
  lateral offset) exposed. Root cause: perception noise draws a fresh
  random ball velocity every tick, and `predictBallTrajectory` integrates
  that noisy velocity out to a 2.5-second horizon, so the chosen approach
  point could jump between substantially different noise-driven
  predictions tick to tick. Fixed by gating tactical replanning
  (mode/target selection) to the difficulty's `tacticalHz`, matching AI
  spec section 5's own design ("do not recalculate tactical state every
  tick") — low-level driving toward the held-stable target still runs
  every tick.
- **Real bug found and fixed while chasing the above: `driveTowardPoint`'s
  steer sign was inverted.** An isolated test driving toward a target
  offset to the car's right (+X, car facing -Z) found the car curving
  left instead — confirmed against the human input mapping
  (`steerRight - steerLeft` in `LogicalGameplayState`, D key => positive
  steer => turns right) that positive `steer` should turn right. This bug
  existed since Phase 9 but was invisible there because every Phase 9
  test scenario placed the ball directly ahead of the car (no lateral
  correction ever needed to succeed). Fixing it also required no changes
  to the Phase 9 test suite — all 8 tests still pass, now for the
  intended reason rather than by accident of test geometry.
- Boost-route awareness is simplified to a per-difficulty search radius
  (`boostPadAwarenessRadius`), not full route-chaining/detour-cost
  analysis (spec sections 28.4-28.5) — see Deferred above.
- Carried over from Phase 1-9: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
