# Current Phase

Phase: 18 — Final Build Gate
Status: Complete — Master Brief "Final Goal" chain verified end to end
Last verified commit: (this commit)

## Phase 18 summary
Master Brief "Final Goal": a clean checkout supports `npm ci -> npm run
validate -> npm run build -> npm run test:release` with no manual fixes.
Ran that literal chain this session; it now passes cleanly. See
`docs/build-decisions.md` Phase 18 section for full detail. In short:
found and fixed a real gap where the Escape-key pause input edge was
sampled but never consumed by any code path (`GameRuntime.onFixedTick()`
now calls `pauseMatch()` on it), added `<link rel="icon" href="data:,">`
to suppress a genuine (if harmless) favicon 404 console error, split
`test:release` to run only `tests/smoke tests/release` against a literal
plain production build (per the Phase 1 deviation's own recommendation —
`tests/integration/**` needs a test-mode build and moved out), and
populated the previously-empty `tests/release/` with
`release-gate.spec.ts` — a suite that drives the app exclusively through
real DOM interaction (no `window.__GAME_TEST__`) so it validates the
actual shipped artifact: full menu-to-match-to-menu flow with zero
console errors, no leaked debug hooks in production, and no third-party
network requests during a live match.

## Tests passing (Phase 18)
- The literal `npm run test:release` command (plain `npm run build` ->
  `playwright test --project=chromium-preview tests/smoke tests/release`)
  passes: 5/5 tests (2 smoke + 3 new release-gate tests).
- Full `chromium-dev`/`chromium-preview` suite against a test-mode build:
  152/156 passed in one combined run; the 4 "failures" were either the
  release-gate test's own plain-build-only assertion (correctly failing
  against a test-mode build, verified separately passing against a plain
  build) or transient resource-contention flakiness under heavy 2-worker
  parallel load (`car-visual`/`texture-visual` timeouts), confirmed
  non-reproducing when re-run in isolation (7/7 passed).
- `npx vitest run`: 21 files, 190 tests, unchanged from Phase 17.

---

# Prior Phase

Phase: 16 — Audio Module
Status: Complete — exit criteria verified

## Working
- `src/audio/AudioTypes.ts`: full spec-accurate type system —
  `AudioSettings`/`DEFAULT_AUDIO_SETTINGS`/`clampAudioSettings`, the 15-type
  `AudioGameEvent` discriminated union (spec section 6), `AudioDiagnostics`
  (spec section 20), and the `AudioModule` interface (spec section 2).
- `src/audio/synth/RetroSynth.ts` (`WebAudioRetroSynth`): real Web Audio
  synthesis — `tone`/`sweep`/`noise`/`chord`, exponential envelope shaping,
  a shared deterministic (non-`Math.random()`) noise buffer.
- `src/audio/synth/ContinuousVoice.ts` (`ContinuousNoiseVoice`): a
  persistent, idempotent-start/stop looping voice for boost/powerslide
  hums (spec section 14 — "never restart a source every frame").
- `src/audio/AudioCooldownRegistry.ts`: per-key rate limiting with
  merge-strongest-wins semantics (spec section 13).
- `src/audio/RetroAudioModule.ts`: the real `AudioModule` — a 7-node gain
  graph (`master -> {effectsMaster{ui,vehicle,impact,match}, musicMaster}`,
  spec section 4), full synthesis recipes for all 16 required sound types
  (spec section 9) plus intensity-mapped gain (`gain = min + i² * (max -
  min)`, spec section 12), context lifecycle (create suspended, resume on
  gesture, suspend), settings application via `setTargetAtTime` ramps.
- `src/integration/AudioEventAdapter.ts`: converts physics/game-flow
  observations into `AudioGameEvent`s every render frame — jump/dodge
  (grounded/dodge-state edges), boost consumption (tick-over-tick
  boost-amount delta), ball-hit (velocity delta threshold), boost pad
  pickup/respawn (active-state diff with a near-player distance gate),
  countdown/goal/overtime/match-end (match-state transitions). Uses Page
  Visibility (not `document.hasFocus()`) to detect backgrounding — see
  `docs/audio-deviations.md`.
- `src/audio/testing/BrowserAudioTestApi.ts`
  (`window.__AUDIO_TEST__`): resume/suspend/emit/setSettings/
  getDiagnostics/stopAll, installed only in dev/test builds.
- `src/core/GameRuntime.ts`: constructs `RetroAudioModule` and
  `AudioEventAdapter` in `initialise()`, applies persisted settings before
  the adapter starts running, exposes `resumeAudioFromGesture`/
  `setAudioSettings`/`getAudioSettings`/`getAudioDiagnostics`/
  `playUiSound(kind)` on the facade — the single chokepoint Vue components
  use (spec section 17: "do not let modules import RetroAudioModule
  directly").
- Every interactive menu/HUD surface (`MainMenu`, `MatchSetup`,
  `SettingsPanel`, `PauseMenu`, `ResultsScreen`) now plays a navigate/
  confirm/cancel sound via `runtime.playUiSound(...)`.
- `GameCanvas.vue`: applies persisted audio settings at boot and installs a
  one-time first-gesture (`pointerdown`/`keydown`) listener that resumes
  the `AudioContext` (spec section 5's browser-autoplay-policy handling).
- `settingsStore.ts`: `AppSettings.audio` extended with `enabled`/
  `musicEnabled` booleans (spec section 19's on/off toggles), defaults
  aligned exactly to `DEFAULT_AUDIO_SETTINGS`.
- `SettingsPanel.vue`'s AUDIO tab: live AUDIO ON/OFF and MUSIC ON/OFF
  toggles alongside the four volume sliders, all wired to
  `runtime.setAudioSettings(...)` immediately on change.

## Failing
- None. All implemented Phase 16 functionality verified locally in this
  session.

## Deferred
- Procedural music (spec section 10) — bus and settings exist, no
  sequencer.
- `BrowserAudioTestApi`'s `getScheduleLog`/`clearScheduleLog`/
  `advanceVirtualTime` (spec section 21's virtual scheduler).
- Fine-ear gain/frequency calibration (spec section 6's calibration pass).
- Car-car impact sound (`audio:car-impact` has a synthesis recipe but no
  adapter-side collision-pair detection — physics doesn't expose one).
- Powerslide continuous voice (`audio:powerslide-state` has a synthesis
  recipe but no adapter-side detection — physics state has no
  powerslide/slip observation, only the last input flag).

See `docs/audio-deviations.md` for the full rationale on each of the above,
plus the Page Visibility vs. `hasFocus()` and Vitest/Playwright testing-split
decisions.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 21 files, 190 tests, all passing,
  including a new `audioCore.spec.ts` (15 tests) covering
  `AudioCooldownRegistry`'s cooldown/merge-strongest-wins semantics and
  `clampAudioSettings`'s clamping/fallback behaviour (the only audio logic
  that runs without a real `AudioContext`). All 175 prior tests (Phases
  1-15) still pass unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: a new `tests/ui/audio.spec.ts` (10 tests): diagnostics report
  `supported: true` on boot, `resumeFromUserGesture()` transitions the
  context to `running`, clicking PLAY resumes it via the first-gesture
  listener, emitting a one-shot event increments `scheduledOneShots`,
  rapid duplicate navigate events are rate-limited by the cooldown window,
  a boost-state continuous voice starts and stops with activity,
  `setSettings` updates reported diagnostics, `stopAll` clears active
  voices, the Settings panel's audio toggles drive live diagnostics, and a
  full live match produces scheduled audio activity with zero console
  errors. All 146 Playwright tests pass across `chromium-dev`/
  `chromium-preview` (full-suite run in this session's log).

## Post-launch polish overhaul (plan/POLISH_OVERHAUL_PLAN.md) — complete

All ten workstreams (WS1-WS10) are complete, verified, and pushed to
`claude/master-build-brief-u8agzk`:

- **WS1** — Input correctness: steering-sign fix, controller support.
- **WS2** — Opponent AI simplify + stuck recovery.
- **WS3** — Dodge/flip-cancel and aerial-control feel tuning.
- **WS4** — Camera overhaul: RL-scale framing, FOV/supersonic feedback,
  ball-cam, impact shake.
- **WS5** — Arena overhaul: transparent glass shell, unified/enclosed
  goals, wall driving (fillets), seated boost pads.
- **WS6** — Opponent AI simplify (chase-and-shoot planner) + stuck
  recovery, ball-spawn fix.
- **WS7** — Gameplay correctness: RL-style kickoff variants + facing,
  auto-flip when stranded upside down, menu-presentation ghost
  visibility, VFX zero-size-particle discard, engine-hum audio.
- **WS8** — Graphics: vertex jitter disabled product-wide (z-fighting),
  paneled floor texture pass.
- **WS9** — UI restyle: self-hosted Wipeout-flavoured typography
  (Russo One / Chakra Petch), `retro-ui.css` design tokens, per-screen
  treatments across every menu/HUD component.
- **WS10** — This final integration pass: full verification block on
  both Playwright projects, `npm run test:release` green against a
  genuine plain production build, screenshot QA across ten key screens,
  a scripted "manual feel" pass (drive/turn/jump/boost/pause/goal) with
  zero console errors and finite physics state throughout, and this
  documentation update.

Final verification snapshot (this pass): `npx vue-tsc --noEmit` clean;
`npx vitest run` 227/227; `npm run validate` (contracts/skills/assets/
architecture) all passing; Playwright full suite 196-198/198 across
`chromium-dev`+`chromium-preview` (the only 2 non-passing are the
expected/documented release-gate artifacts against the `PLAYWRIGHT_TEST=1`
test-mode build, which pass 3/3 when re-run against a genuine plain
`vite build`); `npm run test:release` (real build + smoke/release suite)
7/7 green.

## Ramps & Features plan (plan/RAMPS_AND_FEATURES_PLAN.md) — in progress

Workstreams R1-R13 are implemented, committed, and pushed to
`claude/master-build-brief-u8agzk`:

- **R1** — Arena ramps & corners overhaul (shared physics/visual
  generator).
- **R2** — Hex shell emissive + rib tuning.
- **R3** — Auto-flip v2: contact-based stranded detection, works while
  drifting.
- **R4** — Raised PSX internal resolutions, clean preset + high density
  default.
- **R5** — Hold camera yaw through dodges instead of tracking the
  tumble.
- **R6** — Goal-scored blast force throws nearby cars away from the goal
  mouth.
- **R7** — "WHAT A SAVE!" quick-chat overlay on AI goals.
- **R8** — Removed the duplicate menu ghost ball.
- **R9** — Legend AI difficulty as a real 4th tier.
- **R10** — Rebindable controls + air-roll sensitivity.
- **R11** — Controller menu navigation with anti-double-trigger
  safeguards.
- **R12** — Customise Car menu: live body/boost colour override +
  preview.
- **R13** — Tournament mode: a 4-round easy->medium->hard->legend
  ladder. `TournamentController` (`src/game-flow/TournamentController.ts`)
  is a pure, engine-independent state machine; `GameRuntime` wires it
  into real matches (AI difficulty/duration per round, match-end
  detection, an abandonment safety net that resets the tournament and
  restores pre-tournament settings no matter which "return to menu" path
  triggered it). Two new menu screens (`TournamentBracket.vue`,
  `TournamentVictory.vue`), a `ResultsScreen.vue` CONTINUE/LEAVE
  TOURNAMENT variant, and a `tournamentStore.ts` Pinia mirror. Session-only
  — no persistence, a refresh abandons an in-progress tournament (see
  `docs/build-decisions.md`). `tests/unit/tournament.spec.ts` (9 tests)
  and `tests/game-flow/tournament.spec.ts` (7 scripted end-to-end
  scenarios) both green on `chromium-dev` and a fresh `chromium-preview`
  build; existing `match-flow.spec.ts` (11 tests) and the full
  `npm run test:release` gate stay green, unmodified.

- **R14** — Final integration pass. Ran the full check across R1-R13
  together rather than per-workstream in isolation: `npx vue-tsc --noEmit`
  (clean), `npx vitest run` (296/296), `npm run validate` (contracts/
  three.js-skills/assets/architecture, all pass), the complete Playwright
  suite on both `chromium-dev` and a fresh `chromium-preview` build, and
  `npm run test:release`. Found and fixed one real cross-workstream
  regression: `tests/ui/controller-navigation.spec.ts` (written during
  R11) hardcoded a 2-item main menu (PLAY → one dpad-down → SETTINGS);
  R12 and R13 each inserted a menu item (CUSTOMISE CAR, TOURNAMENT)
  between them, so one dpad-down from PLAY now lands on CUSTOMISE CAR —
  updated the two affected assertions. Everything else that failed on
  the first full-suite run (two `tests/ai/*.spec.ts` timeouts, one
  `tests/ui/audio.spec.ts` timeout, `release-gate.spec.ts`'s "no debug
  hooks" check) was confirmed non-regressive by re-running each in
  isolation: the first three are resource-contention flakiness under
  full-parallel load (all pass cleanly alone), and the release-gate one
  is the known, pre-existing test-mode-build-vs-plain-build distinction
  documented in `docs/build-decisions.md`'s Phase 1 section (the
  `PLAYWRIGHT_TEST=1` build used for `tests/integration/**`-dependent
  suites installs `window.__GAME_TEST__`; the plain build the release
  gate itself requires does not). Did a screenshot QA sweep (throwaway
  spec, not committed) across main menu, match setup (LEGEND chip),
  customise screen (live colour change), a corner mid-climb (confirmed
  the R1 corner-wall geometry actually renders), a goal moment (blast +
  "WHAT A SAVE!" quick chat both visible together), and all three
  tournament-bracket phases plus the CHAMPION victory screen — all
  matched the plan's intent, no further fixes needed. The "manual feel
  checklist" (ramp/corner driving, camera steadiness through dodges,
  auto-flip, rebinding, full virtual-pad menu navigation) is covered by
  existing green suites (`arena-ramps.spec.ts`, `tests/camera/*`,
  `autoFlip.spec.ts`, `rebinding.spec.ts`, `controller-navigation.spec.ts`)
  rather than a separate new scripted pass, since those already exercise
  real inputs end-to-end.

The ramps/features plan (`plan/RAMPS_AND_FEATURES_PLAN.md`, R1-R14) is
now complete.

## Arena flush & refinements (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md) — complete

Workstreams F1-F15, all implemented, tested, committed, and pushed to
`claude/master-build-brief-u8agzk`:

- **F1+F2** — Ramp/corner geometry corrections in the shared generator
  (`ArenaRampGeometry.ts`): the floor-fillet centre radius moved from
  `R − t` to `R + t` so the drivable face traces the exact ideal circle
  at every tilt angle (was leaving a small step/impulse spike where the
  ramp met the floor); corner panels switched from inscribed (chord)
  placement to circumscribed (tangent) placement so they never protrude
  into the drivable field (was up to ~0.55m at the panel midpoints,
  enough to catch a car rounding the corner).
- **F3** — Single-layer square hex shell: every glass-shell surface
  changed from a double-sided 1m box (rendering the hex pattern on both
  parallel faces — the "double layer" look) to a single-sided plane on
  the physics collider's inner face, with per-geometry UV scaling
  (`HEX_TILE_WORLD_SIZE`) replacing a single shared `texture.repeat`
  that stretched ~12:1 on the small corner panels. Hex texture doubled
  in world size, thicker lines, made seam-periodic.
- **F4** — Fixed the kickoff held-throttle stuck bug: the R11 menu-nav
  require-release re-arm mask was firing on every controls activation,
  including COUNTDOWN_GO → PLAYING (not a menu transition), so holding
  W through the countdown got masked at GO. Scoped the re-arm to only
  fire when the activation came from a `MENU_NAVIGABLE_STATES` state.
- **F5** — Rewrote aerial pitch/yaw/roll from `applyTorqueImpulse`
  (mass/inertia-divided, ~23x weaker than intended) to direct
  velocity-space `setAngvel` integration, matching `DodgeController`'s
  existing pattern; all three axis signs were also inverted from the
  RL-standard convention and needed flipping. Re-audited every other
  aerial-input consumer for the same physics-inversion bug: the AI's
  ground-recovery P-D controller had both its proportional AND damping
  terms backwards (fixed); the AI's aerial-pursuit heuristic turned out
  to have an independent, pre-existing sign bug that happened to already
  be correct under the new physics (left alone, confirmed via a real
  convergence test).
- **F6** — Removed the engine sound emitter (kept boost, dodge, jump,
  ball-hit, boost-pad, countdown, goal, and UI sounds unchanged); the
  underlying audio module capability stays intact for direct-emit tests.
- **F7** — Floor panel texture/rotation picks changed from
  `context.random` draws (pure noise) to a deterministic function of
  each panel's distance-to-nearer-edge on both axes, so the pattern
  mirrors across both field axes while keeping the alternating look.
- **F8** — Boost pad layout: removed the 2 centre-circle small pads and
  4 small pads next to the corner pads (16 → 10 total: 6 small + 4
  full), per an explicit locked coordinate list.
- **F9+F10** — Controller focus visibility: eight components' scoped
  `:focus-visible { outline: none; }` were beating the global R11 amber
  focus ring whenever focus arrived via keyboard/gamepad — removed.
  Added focus styling for range/color inputs (newly gamepad-reachable
  via F12). Replaced `PauseMenu.vue`'s two `window.confirm()` call sites
  (invisible to the gamepad layer) with an inline, controller-navigable
  CONFIRM/CANCEL row.
- **F11** — Always-visible ball-cam HUD indicator (bottom-left, mirrors
  the boost meter), showing the current toggle binding for whichever
  input device was most recently used, dim when off / lit amber when
  on. Extracted the R10 settings-panel binding-label formatting into a
  shared `BindingLabels.ts` util.
- **F12** — Settings reachable mid-match from the pause menu, as an
  overlay (matchState stays `PAUSED` throughout — switching to the
  `SETTINGS` state would have un-paused physics via `isPaused()`'s
  gate) rather than a real state transition. Generalised the R11
  gamepad-nav composable's auto-focus to trigger on any visible
  `[data-menu-root]` change per navigation frame, not just on
  `matchState` changes, since opening/closing this overlay doesn't
  change `matchState`.
- **F13** — AI stuck watchdog: if the opponent car makes no ≥1m
  horizontal progress for 4s of live play, it's teleported to a real
  kickoff pose (reusing `kickoffSpawn`, not a second hardcoded
  position). Deliberately longer than the AI's own 3s self-recovery
  steering window (`aiUnstuck.spec.ts`, unaffected), so this is a
  last-resort backstop, not a replacement.
- **F14** — Goal-blast buff: radius 16→26, max Δv 18→30, plus a 0.4
  falloff floor so cars near the edge of the radius still get a solid
  shove instead of a near-zero linear-falloff nudge.
- **F15** — Final integration pass (this entry). `npx vue-tsc --noEmit`
  clean; `npx vitest run` 324/324; `npm run validate` (contracts/
  three.js-skills/assets/architecture) all pass; full Playwright sweep
  on `chromium-dev` (153/154 — the one non-pass is
  `release-gate.spec.ts`'s plain-build-only "no debug hooks" check
  running against the dev server, which always exposes test hooks by
  design; expected, not a regression) and on a fresh `PLAYWRIGHT_TEST=1`
  `chromium-preview` build (151/151, all non-`tests/release` suites);
  `npm run test:release` (its own plain, non-test build) 7/7 green,
  including the debug-hooks check passing correctly against that build.
  Screenshot QA (throwaway spec, not committed) across the main menu
  (single hex layer, square hexes, symmetric floor, continuous corner
  shell), a wall/corner climb, a goal-blast moment, both ball-cam
  indicator states, and the full pause → SETTINGS → overlay → BACK →
  RESUME flow — all matched the plan's intent. The "manual feel
  checklist" (kickoff-hold launch, aerial tilt direction/speed, corner
  drive-around, ramp base at speed, controller focus on every screen)
  is covered by the newly-gated suites above (`kickoff-throttle.spec.ts`,
  `aerialControl.spec.ts`, `wallDriving.spec.ts`, `arena-ramps.spec.ts`,
  `focus-visibility.spec.ts`) rather than a separate scripted pass.

The arena flush & refinements plan
(`plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md`, F1-F15) is now complete.

## Next exact task
- No open task from this plan. Future work would go back to picking
  up items from the various `docs/*-deviations.md` "Deferred" lists
  (procedural music, car-car impact/powerslide audio detection, live
  camera/most-accessibility settings wiring, custom keyboard/gamepad
  settings navigation, Escape-to-resume, code-splitting the >500kB
  bundle chunks, etc.) rather than a new numbered phase or workstream.

## Known deviations
- See `docs/audio-deviations.md` for the full Phase 16 deviations list
  (deferred music, deferred virtual scheduler, un-implemented car-impact/
  powerslide detection, Page Visibility vs. focus, Vitest/Playwright test
  split).
- Carried over from Phase 1-15: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__`/`__AUDIO_TEST__` only install when
  `__TEST_BUILD__` is true, which the literal `test:release` script (plain
  `npm run build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed at
  boot.
