# Current Phase

Phase: 15 — UI and Settings Polish
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/stores/settingsStore.ts`: a real, persisted `AppSettings` object
  (`localStorage` key `space-carball-settings-v1`, spec section 25) with
  `validateSettings()` sanitising every field individually against
  `DEFAULT_SETTINGS` — a corrupted/edited/older-schema stored value
  degrades field by field instead of discarding the whole object.
- `src/components/menu/SettingsPanel.vue`: replaces the Phase 7
  placeholder with the real 6-category UI (GAMEPLAY/CAMERA/GRAPHICS/
  AUDIO/CONTROLS/ACCESSIBILITY, spec section 25) with functional controls
  for every listed field. Two categories are fully live end-to-end:
  GRAPHICS' pixel preset (`runtime.setVisualPreset`) and ACCESSIBILITY's
  "reduced jitter"/"disable dithering" (new
  `PlaceholderSceneRenderer.setAccessibilityOverrides`, applied on top of
  whichever preset is selected). GAMEPLAY's default match length is also
  live (`runtime.selectMatchDuration`). CONTROLS shows the default
  keyboard/mouse/gamepad bindings read-only (spec explicitly permits
  deferring rebinding). Every field across every category is real UI,
  real state, and real persistence even where not yet live-wired to an
  engine effect — see Known deviations.
- `GameCanvas.vue`: loads persisted settings right after
  `runtime.initialise()` and applies the visual preset, accessibility
  overrides, and default match duration before the first rendered frame.
- `PlaceholderSceneRenderer.setAccessibilityOverrides()`: layers
  jitter/dither overrides on top of the active preset rather than
  requiring the user to give up the preset's resolution/colour-level
  choice to get them; `getVisualDiagnostics()` now reports the effective
  (preset + overrides) settings, not just the raw preset.
- `window.__GAME_TEST__.runtime.setAccessibilityOverrides()`: new test
  hook mirroring the above.

## Failing
- None. All Phase 15 exit criteria verified locally in this session.

## Deferred
- Live wiring for camera settings (FOV/distance/height/stiffness/ball-
  look/shake) — `ChaseCameraController` reads module-level constants, not
  a per-instance settings input yet.
- Live wiring for audio settings (master/music/effects/UI) — the audio
  module is still `NullAudioModule` (Phase 16).
- Live wiring for the remaining accessibility toggles (reduced shake,
  reduced flashes, high-contrast ball, team-pattern mode, larger HUD),
  graphics particle/star density, and glow — persisted and shown in the
  UI, no backing engine effect yet.
- Keybind rebinding UI (spec explicitly permits deferring this).
- Full custom keyboard/gamepad menu navigation (spec section 22's focus
  chevron/scan animation) — native browser Tab order and `:focus-visible`
  styling are used instead of a custom nav system.

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 20 files, 175 tests, all passing,
  including a new `settingsStore.spec.ts` (7 tests): defaults for
  undefined/null/garbage/empty input, field-by-field fallback under
  partial corruption, enum rejection, numeric clamping, schema-version
  stamping, and idempotency. All 168 prior tests (Phases 1-14) still pass
  unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: a new `tests/ui/settings.spec.ts` (6 tests): all six
  category tabs render with GAMEPLAY default-selected, a graphics preset
  change takes effect on the live renderer immediately, accessibility
  jitter/dither toggles apply live, settings persist across a full page
  reload (verified via both the live diagnostics and the raw
  `localStorage` value), a corrupted `localStorage` value falls back to
  defaults with zero console errors, and changing the default match
  length in Settings changes Match Setup's selected duration. All prior
  Playwright tests still pass — see the full-suite run in this session's
  log (63 tests total across `chromium-dev`/`chromium-preview`).

## Next exact task
- Begin Phase 16 (audio module) per `plan/MASTER_BUILD_BRIEF.md` and
  `plan/retro_audio_module_spec.md`. Required reading before starting:
  that spec file in full (not yet read this session). The settings
  store's `audio.master/music/effects/ui` fields already exist and are
  persisted, ready for the real audio module to read once it exists — do
  not re-invent a second audio-settings surface.

## Known deviations
- Settings-spec's rich `VisualPreset` deep-partial-merge API was not
  implemented; only two named accessibility overrides were added instead
  — see `docs/visual-language-deviations.md` Phase 15 section.
- Camera/audio/most-accessibility settings are real+persisted UI without
  a live engine effect yet — see Deferred above.
- No custom keyboard/gamepad settings-navigation system.
- Carried over from Phase 1-14: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
