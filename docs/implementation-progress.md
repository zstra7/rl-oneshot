# Current Phase

Phase: 14 — Stadium Art and VFX
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/assets/procedural/StadiumGeometryFactory.ts`: floor markings
  (centre line, centre circle, goal-box outlines — PSX visual spec
  section 13) and instanced structural ribs along both side walls
  (`THREE.InstancedMesh`, spec section 13's "thick enough to read at
  320x180... never block goals"), scaled to fit this project's existing
  field footprint (see Known deviations).
- `src/vfx/VfxModule.ts`: the real VFX module (Master Brief Phase 14,
  replacing the `NullVfxModule` stub) — a single shared, fixed-size (500)
  particle pool rendered as one `THREE.Points` draw call with a custom
  per-particle-sized `ShaderMaterial`. Three effects, each driven purely
  by observing existing physics/game-flow state (no new physics/input
  events needed): a boost trail (detected via a car's `boostAmount`
  dropping tick-to-tick), a ball-impact burst (detected via an abrupt
  ball velocity change), and a team-coloured goal-celebration burst
  (detected via entering the `GOAL_CELEBRATION` match state). Wired into
  `GameRuntime` as a `RenderFrameModule` the same way
  `PhysicsRenderBinding`/`ChaseCameraController` are.
- `window.__GAME_TEST__.runtime.getVfxActiveParticleCount()`: a new test/
  diagnostic hook used to verify particles actually spawn and later decay
  (pooling, not a leak) without relying on pixel-level screenshot
  comparison.

## Failing
- None. All Phase 14 exit criteria verified locally in this session.

## Deferred
- Curved floor-to-wall/wall-to-ceiling transitions, the segmented
  transparent glass shell, and the floating mechanical base (spec section
  13) — each a substantially larger geometry-authoring task than what was
  built this phase. See `docs/visual-language-deviations.md`.
- Car-car impact particles, jump bursts, powerslide sparks (spec section
  19) — need either a dedicated physics collision-event channel or
  per-tick input-edge tracking that doesn't exist yet.
- The full goal-celebration choreography (shockwave, shards, arena pulse,
  star streak, banner, camera impulse — spec section 20) — reduced to a
  single team-coloured particle burst this phase; the other five
  sub-effects are each a separate system.
- Starfield goal response (radial star streak, team-colour pulse, brief
  exposure lift — spec section 16).

## Tests passing
- `npm run validate` — all four validators pass (no asset-layout changes
  this phase).
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 19 files, 168 tests, all passing,
  including a new `vfxModule.spec.ts` (7 tests): starts empty, spawns
  boost-trail particles only while a car actively consumes boost (not for
  a car with boost held but empty/no-boost input), spawns an impact burst
  on an abrupt ball velocity change, spawns a larger celebratory burst on
  entering `GOAL_CELEBRATION`, particles decay back to zero after their
  lifetime (pooling, not a leak), and the pool never exceeds its fixed
  size under sustained heavy spawning. All 161 prior tests (Phases 1-13)
  still pass unchanged.
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright: all 54 prior tests still pass, plus 6 new tests across
  `tests/visual-language/stadium-vfx.spec.ts` (3: stadium art renders
  with no console errors, boosting spawns particles that later decay to
  zero, a goal spawns a celebratory burst) — 57/57 total on `chromium-dev`
  and `chromium-preview`. Verified visually via a Playwright screenshot
  showing the centre line, centre circle, and structural wall ribs
  clearly rendered on the field.

## Next exact task
- Begin Phase 15 (UI and settings polish) per `plan/MASTER_BUILD_BRIEF.md`
  and this spec's sections 22-27/34-38 (main menu, match setup, settings,
  gameplay HUD, navigation, pause/results polish — persistence,
  keyboard/gamepad navigation). Required reading before starting: those
  sections (not yet read in depth this session). Do not touch the audio
  module (Phase 16) yet.

## Known deviations
- Stadium field dimensions were not resized to this spec's 72x48 — a
  pre-existing deviation from Phase 3 onward that everything since has
  been calibrated against; see `docs/visual-language-deviations.md`.
- VFX scope: three effects with an unambiguous trigger signal; several
  spec-listed effects deferred — see Deferred above and
  `docs/visual-language-deviations.md`.
- Floor markings/ribs use the existing footprint's scale, not the spec's
  literal dimensions.
- Carried over from Phase 1-13: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
