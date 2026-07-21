# Current Phase

Phase: 7 — Functional Match Flow
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/game-flow/MatchFlowController.ts`: the one `MatchFlowController`
  (game-flow spec section 28) owning `MatchState` end to end — main menu,
  match setup (1/3/10 minute selection), kickoff reset, the 3/2/1/GO
  countdown (tick-exact at 120Hz, not wall-clock), regulation clock,
  zero-second continuation, goal latch/scoring/celebration/reset,
  overtime intro + golden goal (no extra kickoff), match ending, results,
  replay, return-to-menu, and pause/resume. UI only ever calls this
  controller's public methods — it never assigns state directly.
- `src/physics/goal/` + `TestArenaPresets.ts`: real goal openings (not a
  solid end wall) with an enclosed goal box behind each, and sensor
  colliders that emit a raw `GoalScoredEvent` on overlap onset — physics
  reports the fact, match-flow applies the scoring rule/latch.
- `GameRuntime.onFixedTick` now follows the game-flow spec section 34
  runtime order exactly: `gameFlow.update()` -> (if not paused) sample or
  neutralise input based on `gameFlow.areControlsActive()` -> physics step
  (skipped entirely while paused) -> `gameFlow.applyPhysicsResults()`
  (consumes goal events, applies the zero-second dead-ball rule) -> app
  state resync -> `runtime:session-state-changed` emission.
- `src/stores/matchFlowStore.ts` + `src/App.vue`: the Vue UI mirrors
  `GameSessionState` via `runtime:session-state-changed`, emitted once per
  fixed tick from inside the existing single game loop — no second
  `requestAnimationFrame` loop was added anywhere (see
  `docs/build-decisions.md` Phase 7 section for why an earlier, per-frame
  version of this had to be reworked).
- Minimal but real, functional UI: `MainMenu`/`MatchSetup`/`SettingsPanel`
  (menu family), `GameplayHud`/`CountdownOverlay`/`GoalBanner`/
  `OvertimeBanner`/`PauseMenu`/`ResultsScreen` (match family) —
  `src/components/menu/` and `src/components/hud/`. Full PSX art
  direction/VFX is out of scope (Phases 13-15); these are functional,
  legibly-styled placeholders satisfying Phase 7's own exit criteria.
- `window.__GAME_TEST__.gameFlow` (`BrowserGameFlowTestApi`): navigation,
  duration selection, `startMatch`, deterministic `advanceGameTicks`/
  `advanceGameSeconds`, `simulateGoal`/`simulateBallFloorContact`,
  pause/resume/replay/return-to-menu, and the match-flow event log.

## Failing
- None. All Phase 7 exit criteria verified locally in this session.

## Deferred
- Full main-menu/HUD/results art direction, goal celebration VFX, boost
  pad pickup/respawn VFX (`collected-pulse`), camera work, and rebinding/
  settings persistence — all explicitly later phases (8, 13, 14, 15) per
  the Master Brief; Phase 7 only needed the *functional* flow to exist.
- `resetApplication`, `simulateBoostPadPickup`/`getBoostPadVisualStates`,
  `setVisualPreset`/`getVisualPreset`/`setCameraPreset`/
  `setPresentationSeed`/`getVisualDiagnostics` from the full game-flow
  spec section 39 test API — see
  `src/game-flow/testing/BrowserGameFlowTestApi.ts`'s doc comment.
- Scorer attribution (`goal-awarded`'s optional `scorerCarId`) is not
  populated — physics does not yet track "last car to touch the ball"
  as a queryable fact (that lives in the car-ball collision resolver,
  Phase 5/9 territory); the goal banner shows a generic "GOAL!" rather
  than crediting a specific car.
- Pause-menu SETTINGS navigation (spec section 33 lists 4 pause-menu
  items; this phase implements RESUME/RESTART MATCH/RETURN TO MENU only,
  each behind a `window.confirm()` guard for the destructive ones) — full
  in-match settings sub-navigation is Phase 15 UI polish scope.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 13 files, 95 tests, all passing,
  including new `goalSensors.spec.ts` (6 tests: correct scoring team for
  each end, no false positives, one-event-per-onset not per-tick,
  `clearGoalEvents`, `resetWorld` clearing the latch) and `matchFlow.spec.ts`
  (9 tests: menu navigation, duration retained into `PLAYING`, the full
  3/2/1/GO countdown sequence with controls gated until GO, a goal's
  full latch/celebrate/reset/countdown cycle with no double-count, pause
  freezing the clock and restoring the prior state on resume, the
  regulation clock reaching zero into `ZERO_SECOND_PLAY` while keeping
  controls live, a tied dead ball entering overtime and the golden goal
  ending the match with no extra kickoff, `replayMatch`, and
  `returnToMenu`).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all prior suites still pass (35 total across
  `chromium-dev`/`chromium-preview`, up from 27, after two required
  fixes — see Known deviations) plus a new
  `tests/game-flow/match-flow.spec.ts` (8 tests) covering the game-flow
  spec section 40 required list: main menu visible at boot, duration
  selection retained into a started match, the countdown event sequence
  with controls disabled until GO, the one-minute timer reaching `0:30`
  and pausing/resuming correctly, a goal's full cycle, the results screen
  (victory/defeat, final score, replay/return buttons), replay, and
  return-to-menu (HUD hidden, menu shown, score reset). Verified visually
  via Playwright screenshots of the main menu, match setup, in-match HUD,
  and goal banner.

## Next exact task
- Begin Phase 8 (camera and gameplay HUD) per `plan/MASTER_BUILD_BRIEF.md`
  and the game-flow/visual-language spec's camera section (21) plus the
  HUD section (26, already given a first functional pass this phase —
  Phase 8 replaces the fixed debug view with the real third-person chase
  camera and polishes HUD presentation). Required reading before
  starting: Core Architecture spec (already read) + this progress file +
  visual-language spec sections 21 (camera) and 26 (HUD, for anything not
  already covered). Do not implement AI (Phase 9) or PSX post-processing
  (Phase 13) yet.

## Known deviations
- See `docs/physics-deviations.md` Phase 7 section for the goal-sensor
  geometry/detection deviations (goal box enclosure, sensor-onset
  latching, and a real Rapier teleport/broad-phase-lag bug found via ad
  hoc debugging) and `docs/build-decisions.md` Phase 7 section for the
  `AppState` mapping and the `runtime:session-state-changed` per-tick
  (not per-frame) emission decision — the latter was a real fix: an
  earlier per-rendered-frame version required a second component-owned
  `requestAnimationFrame` loop to consume it, which broke
  `tests/integration/runtime.spec.ts`'s "exactly one rAF loop" invariant.
- Two pre-existing Playwright tests needed updates for Phase 7's new
  input-gating behaviour (gameplay input is now neutralised outside
  `PLAYING`/`ZERO_SECOND_PLAY`/`OVERTIME_PLAYING`, per game-flow spec
  section 27): `tests/physics/car-driving.spec.ts`'s two tests now call
  `gameFlow.startMatch()` + `advanceGameTicks()` through the kickoff
  countdown before driving, instead of driving immediately at boot
  (which is now the main-menu presentation state, where controls are
  correctly inert).
- Carried over from Phase 1-6: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
