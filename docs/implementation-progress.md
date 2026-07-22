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

R14 (final integration pass across the whole ramps/features plan) is the
next and last workstream in this plan.

## Next exact task
- R14: final integration pass for plan/RAMPS_AND_FEATURES_PLAN.md
  (full verification across R1-R13 together, screenshot QA, docs
  consolidation). Once that lands, future work would go back to picking
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
