# Current Phase

Phase: 16 — Audio Module
Status: Complete — exit criteria verified
Last verified commit: (this commit)

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

## Next exact task
- Begin Phase 17 (Integration hardening) per `plan/MASTER_BUILD_BRIEF.md`.
  Required reading before starting: whichever spec file(s) that phase
  references (not yet read this session).

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
