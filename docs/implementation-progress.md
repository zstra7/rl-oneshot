# Current Phase

Phase: 13 — PSX Visual Language
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/visual-language/PsxVisualPalette.ts`: the PSX visual spec section 6
  `VISUAL_PALETTE` constant, now the single source of truth for team
  colours (`playerCyan`/`opponentMagenta`) — `CarDescriptors.ts` and
  `ProceduralCarFallback.ts` both source their team colours from it
  instead of the ad hoc hex values picked in earlier phases.
- `src/visual-language/PsxRenderSettings.ts`: `PSX_RENDER_PRESETS`
  (authentic 320x180 / balanced 426x240 / clean 640x360, with the spec's
  own dither-strength/colour-level tables per preset) and
  `JITTER_STRENGTH_BY_CATEGORY` (spec section 8's exact per-category
  table).
- `src/visual-language/VertexJitter.ts`: `applyVertexJitter(material,
  category)` wires PSX clip-space vertex snapping into any `THREE.Material`
  via `onBeforeCompile`, injected immediately after three's own
  `<project_vertex>` chunk (screen-space, after the MVP matrix, exactly as
  spec section 8 requires). Idempotent per material instance (a `WeakMap`
  guard, safe against `CarAssetLoader`'s per-team material cloning).
  Wired into car (real GLB + procedural fallback), ball, stadium floor/
  wall, and boost pad materials.
- `src/visual-language/PsxRenderPipeline.ts`: the real spec section 7
  pipeline — renders the 3D scene into a low-resolution
  `WebGLRenderTarget` (nearest filter, no mipmaps), then a full-viewport
  quad shader applies contrast, Bayer dither (section 9's fixed 4x4
  matrix, dither-then-quantise), and per-channel colour quantisation,
  with the render target's own nearest filtering providing the
  "nearest-neighbour upscale" for free.
- `PlaceholderSceneRenderer.ts`: `updateRenderFrame` now renders through
  `PsxRenderPipeline`; gained `setVisualPreset`/`getVisualPreset`/
  `getVisualDiagnostics`.
- `GameRuntime`/`window.__GAME_TEST__.runtime`: `setVisualPreset`/
  `getVisualPreset`/`getVisualDiagnostics` (PSX visual spec section 39),
  live preset switching that resizes the internal render target and
  rebroadcasts the jitter grid to every registered material.

## Failing
- None. All Phase 13 exit criteria verified locally in this session.

## Deferred
- Full stadium art (ribs, glass panels, floor markings — this spec's own
  "Phase 7") is Master Brief Phase 14, not built here.
- Bloom/glow pass (spec section 7, explicitly marked optional) — deferred
  to Phase 14 alongside the rest of stadium VFX polish.
- A settings UI toggle for visual preset (Phase 15) — `setVisualPreset`
  exists and works but nothing in the Vue UI calls it yet.
- Fine-grained `DeepPartial<VisualPreset>` settings overrides (spec
  section 39) — only whole-preset selection is implemented; see
  `docs/visual-language-deviations.md`.
- Playwright visual regression / screenshot-matrix tooling (spec sections
  41/43) beyond the ad hoc/committed screenshots taken during this
  session — no dedicated golden-image comparison harness yet.

## Tests passing
- `npm run validate` — all four validators pass (no asset-layout changes
  this phase).
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 18 files, 161 tests, all passing,
  including a new `psxVisualLanguage.spec.ts` (14 tests): palette hex
  validity, preset resolution/dither/colour-level ordering, the exact
  per-category jitter strength table, `applyVertexJitter`'s shader
  injection (simulated `onBeforeCompile` invocation without a real WebGL
  context), idempotency, enabled/disabled defaults, the strength-to-grid-
  resolution relationship, `updateAllJitterHandles` broadcasting, and
  `PsxRenderPipeline`'s render-target sizing/resize. All 147 prior tests
  (Phases 1-12) still pass unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 50 prior tests still pass, plus a new
  `tests/visual-language/psx-pipeline.spec.ts` (4 tests): defaults to the
  balanced preset, `setVisualPreset` switches internal resolution/jitter
  live with zero console errors, a full live match runs correctly through
  the authentic-preset pipeline (car position stays finite, screenshot
  captured), and cycling through all three presets produces no
  WebGL/shader console errors — 54/54 total on `chromium-dev` and
  `chromium-preview`. Verified visually via Playwright screenshots
  showing a clear, correct difference between the heavily-pixelated
  authentic preset and the much smoother clean preset, both with the new
  cyan/magenta team colours visible on the cars.

## Next exact task
- Begin Phase 14 (stadium art and VFX) per `plan/MASTER_BUILD_BRIEF.md`
  and this spec's sections 12-20/32/36-42 (stadium geometry/ribs/glass
  panels/floor markings, boost pad VFX polish deferred since Phase 6,
  starfield layers, core VFX, goal celebration). Required reading before
  starting: those sections (only skimmed so far for phase-boundary
  purposes). Do not touch menu/settings polish (Phase 15) yet.

## Known deviations
- `VisualPreset` naming collision resolved by introducing
  `PsxRenderSettings` as a distinct type — see
  `docs/visual-language-deviations.md`.
- `setVisualPreset` takes a preset id, not a `DeepPartial` settings patch.
- Vertex jitter "strength" is interpreted as an inverse grid-resolution
  scale, not a blend factor (the spec's own conceptual shader has no
  blend to speak of).
- Boost pads use the closest existing jitter category (`goalOutlines`)
  since the spec's category table has no dedicated entry for them.
- No bloom/glow, no accessibility-specific settings UI yet — see Deferred
  above.
- Carried over from Phase 1-12: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
