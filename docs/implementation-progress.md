# Current Phase

Phase: 6 — Boost Pads
Status: Complete — exit criteria verified
Last verified commit: (this commit)

## Working
- `src/physics/boost/BoostPadTypes.ts`: `BoostPadType`, sensor-radius
  constants, pickup amounts (12 small / fill-to-100 full), respawn timers
  (480 ticks small / 1200 ticks full at 120 Hz), observation/claim/event
  types.
- `src/physics/boost/BoostPadLayout.ts`: default stadium layout — 12 small
  pads on a 3x4 grid, 4 full pads at the corners, all sitting on top of
  the floor (`floorTopY + halfHeight`, not centred through it).
- `src/physics/boost/BoostPadRegistry.ts` / `BoostPadSystem.ts`: sensor
  colliders built via `RAPIER.ColliderDesc.cylinder(...).setSensor(true)`
  with no parent body; deterministic claim resolution per physics spec
  21.7 (nearest car by squared distance, tie-break by velocity toward the
  pad, then lexical `CarId`); tick-exact respawn using the post-increment
  physics tick so "respawns N ticks after collection" is exact whether
  collection happened via a genuine sensor overlap during `step()` or via
  the test-only `collectBoostPadForCar()` bypass.
- `PhysicsFacade` integration: pad colliders built in `initialise()`,
  `resolveClaims`/`processRespawns` called every `step()` immediately
  after the tick counter increments, full reset on `resetWorld()` (all
  pads active, all cars to kickoff boost), new public surface
  (`getBoostPadStates`, `setBoostPadState`, `collectBoostPadForCar`,
  `getBoostPadEvents`, `clearBoostPadEvents`), `boostPads` array added to
  `WorldSerializableState`.
- `src/assets/procedural/BoostPadVisualFactory.ts`: procedural pad visual
  (plate + ring + glyph for small pads, plate + ring + energy cluster for
  full pads) using shared geometry/plate materials but a **per-pad-
  instance** ring material (`MaterialRegistry.createInstanceMaterial`) so
  each pad's active/respawning visual state is independent of every other
  pad.
- `src/integration/BoostPadRenderBinding.ts`: new `RenderFrameModule`,
  wired into `GameRuntime` alongside `PhysicsRenderBinding` — lazily
  builds one visual per pad from `physics.getBoostPadStates()` on first
  frame, then updates each pad's active/respawning material state every
  frame.
- `SuspensionController` fix: `world.castShape()` for the suspension
  probes now passes `RAPIER.QueryFilterFlags.EXCLUDE_SENSORS` — pad
  sensor colliders must never be treated as ground contact.

## Failing
- None. All Phase 6 exit criteria verified locally in this session.

## Deferred
- A dedicated "collected pulse" flash VFX state (`collected-pulse` in
  `BoostPadVisualState` exists but nothing currently transitions a pad
  into it) — deferred to Phase 14 (stadium art/VFX).
- HUD boost meter / pickup feedback — deferred to Phase 8.
- Match-flow kickoff sequencing itself (pad reset on kickoff is
  implemented in `resetWorld()`, but the trigger for calling it during a
  real match is Phase 7).

## Tests passing
- `npm run validate` — all four validators pass.
- `npm run type-check` (`vue-tsc --noEmit`) — zero errors.
- `npm run test:unit` (Vitest) — 11 files, 80 tests, all passing,
  including a new `boostPads.spec.ts` (13 tests) covering: exact 12/480-
  tick and fill-to-100/1200-tick behaviour for small/full pads, boost-cap
  clamping, a full car producing no pickup event, an inactive pad
  granting no boost even while overlapped, genuine sensor-overlap
  collection by driving a real car onto a pad, no consumption without
  overlap, simultaneous two-car contested claims (nearest wins,
  independent of car-registry insertion order), kickoff reset restoring
  every pad and both cars, the ball rolling through a pad not collecting
  it, paused ticks freezing the respawn timer, and stable pad-observation
  ordering (16 pads total).
- `npm run build` (validate -> type-check -> unit -> `vite build`) —
  passes on a plain production build.
- Playwright `tests/physics/boost-pads.spec.ts` (2 tests, new): the
  default layout has 16 active pads at boot, and collecting a pad through
  the live `window.__PHYSICS_TEST__` API grants the correct boost,
  deactivates the pad, and it respawns after exactly 480 ticks. All prior
  suites still pass — 29/29 total on `chromium-dev` and on
  `chromium-preview` against a `PLAYWRIGHT_TEST=1` test-mode build.
- Verified visually via a Playwright screenshot: 12 small pads (thin
  ring + octahedron glyph) and 4 full pads (larger ring + cone energy
  cluster) rendered on top of the floor around the car/ball.

## Next exact task
- Begin Phase 7 (functional match flow) per `plan/MASTER_BUILD_BRIEF.md`.
  Required reading before starting: Core Architecture spec (already
  read) + this progress file + the game-flow/UI module spec's match-flow
  section (main menu, match setup with 1/3/10 minute selection,
  countdown, playing, goal sensors + score, goal latch/reset, match
  clock, zero-second rule, overtime, pause, results, replay, return to
  menu). Implement app-state transitions (`MENU` -> match setup ->
  countdown -> `PLAYING` -> goal -> ... -> `RESULTS`), goal sensor
  colliders analogous to the boost pad sensors already built this phase,
  and wiring `resetWorld()`/pad reset into the real kickoff sequence.

## Known deviations
- See `docs/physics-deviations.md` Phase 6 section for the full list.
  Most notable: two real bugs were found and fixed during this phase —
  boost pad sensor colliders corrupting suspension probes (fixed via
  `EXCLUDE_SENSORS` + pads sitting on top of the floor instead of buried
  through it), and an off-by-one respawn-tick bug (fixed by resolving
  claims/respawns after the tick increment, not before).
- Carried over from Phase 1-5: `window.__GAME_TEST__`/`__ASSET_TEST__`/
  `__PHYSICS_TEST__`/`__INPUT_TEST__` only install when `__TEST_BUILD__`
  is true, which the literal `test:release` script (plain `npm run
  build`) does not set — see `docs/build-decisions.md`. A benign
  `@dimforge/rapier3d-compat`-internal console warning is still observed
  at boot.
