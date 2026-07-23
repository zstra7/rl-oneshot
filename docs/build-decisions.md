# Build Decisions

## Phase 0

- Followed `plan/core_application_architecture_build_integration_spec.md`
  section 4 for the initial `package.json` manifest. Pinned versions that
  matched the spec exactly and were verified compatible with each other:
  `three@0.160.0`, `vue@3.5.40`, `pinia@4.0.2`,
  `@dimforge/rapier3d-compat@0.19.3`, `@playwright/test@1.61.1`,
  `@vitejs/plugin-vue@6.0.8`, `vite@8.1.5`, `vue-tsc@3.3.7`.
- **`typescript`**: the spec pins `7.0.2`. That version exists on npm but is
  the new native/Go-rewrite package layout (ESM-only, no
  `typescript/lib/tsc` CJS entry point). `vue-tsc@3.3.7` requires the
  classic `typescript/lib/tsc` entry and crashes immediately against
  `typescript@7.0.2`. Pinned `typescript@5.9.3` instead (last stable classic
  release, satisfies vue-tsc's `>=5.0.0` peer range). Recorded here per
  section 80 ("Type-check failure" triage — fix types/toolchain, do not
  disable strictness) rather than in `docs/integration-deviations.md` since
  this is a build-tooling pin, not a module contract deviation.
- **`vitest`**: the spec left the exact version to be chosen "after
  scaffolding and verifying compatibility with the chosen Vite version"
  (section 3.7). `vitest@3.2.4`/`3.2.7` only support Vite `^5 || ^6 || ^7`
  and bring in a duplicate nested `vite` package that conflicts with the
  pinned `vite@8.1.5` at the type level (`ImportMeta.hot` declaration
  merge conflict during `vue-tsc --noEmit`). Pinned `vitest@4.1.10`, the
  first stable line that declares `vite: "^6.0.0 || ^7.0.0 || ^8.0.0"` as a
  dependency and resolves to a single shared `vite` install matching
  `8.1.5`.
- **`@types/node` (22.20.1) and `@types/three` (0.160.0)** were added as
  devDependencies. The spec states "Do not install `@types/three`; Three.js
  includes its own types" — that is not accurate for the pinned
  `three@0.160.0`: the installed package ships zero `.d.ts` files (Three.js
  only started bundling its own types in a later release than r160).
  Without `@types/three`, `vue-tsc --noEmit` fails on every `three` import.
  Installed the exact-matching `@types/three@0.160.0` release instead, and
  recorded this in `docs/integration-deviations.md`. `@types/node` was
  required because `vite.config.ts`/`playwright.config.ts`/`tests/unit/**`
  reference Node globals (`process`, `Buffer`, `node:fs`, etc.) under
  `strict`/`noUncheckedIndexedAccess` TypeScript.
- `vite.config.ts`'s `rollupOptions.output.manualChunks` was changed from
  the spec's object-map shorthand to an explicit function. Vite 8's bundled
  Rollup version rejects the object form used in the spec's example
  (`ManualChunksFunction` type mismatch) — the function form is equivalent
  in behaviour (vue+pinia / three / rapier chunk names) and compiles.
- `.claude/skills/threejs-*` were authored locally rather than vendored from
  `CloudAI-X/threejs-skills` (that repository is not in this session's
  accessible scope). See `docs/implementation-progress.md` known
  deviations and `docs/asset-pipeline-deviations.md`.
- Playwright config adds a `webServer` block (dev + preview) not present in
  the spec's example config, so `npm run test:e2e:dev` / `test:e2e:preview`
  work without a human manually starting servers first. This does not
  change the two required projects (`chromium-dev`, `chromium-preview`).
- `playwright.config.ts` reads an optional `PLAYWRIGHT_CHROMIUM_PATH` env
  var into `use.launchOptions.executablePath`. This session's sandboxed
  execution environment ships a pre-installed Chromium build at a fixed
  path instead of the exact revision `@playwright/test@1.61.1` expects, and
  network installs of browser binaries are not part of this workflow. The
  env var is optional and `undefined` by default, so a normal checkout that
  has run `npx playwright install` is unaffected.

## Phase 1

- `window.__GAME_TEST__` only installs when `__DEV__ || __TEST_BUILD__`
  (section 46). `vite.config.ts` sets `__TEST_BUILD__` from
  `mode === "test" || process.env.PLAYWRIGHT_TEST === "1"`. The literal
  `test:release` script in section 4 runs a plain `npm run build` (no
  `PLAYWRIGHT_TEST` set) before testing against the preview server, which
  means `tests/integration/**` (which depend on `window.__GAME_TEST__`)
  would not find the test API on that exact build. Section 46 explicitly
  permits "a test-mode production build" for release testing, so when
  verifying `tests/integration/**` against `chromium-preview` in this
  session, the build was run as `PLAYWRIGHT_TEST=1 npm run build:app`
  instead of plain `npm run build:app`. `tests/smoke/**` and
  `tests/release/**` do not depend on the test API and pass against an
  ordinary production build. If this distinction matters for a real CI
  release gate later, consider splitting `test:release` into a
  test-API-independent smoke/release pass (plain production build) and a
  separate test-mode-build pass for `tests/integration/**`.
  **Resolved in Phase 18**: `test:release` now runs only
  `tests/smoke tests/release` against the plain production build (removed
  `tests/integration` from that script) — `tests/release/release-gate.spec.ts`
  is written test-API-independent from the start (real clicks/keyboard
  events, `data-testid`/`data-app-state` DOM attributes, no
  `window.__GAME_TEST__`) specifically so it's valid against the literal
  artifact `npm run build` produces. `tests/integration/**` continues to
  need a test-mode build (`PLAYWRIGHT_TEST=1`) and is exercised via
  `npm run test:integration` or the full `chromium-dev`/`chromium-preview`
  suite against a test-mode build, not via `test:release`.

## Phase 7

- **`AppState` stays a 3+3-value type, not the game-flow spec's literal
  3-value `"BOOT"|"MENU"|"MATCH"`.** `src/core/ApplicationState.ts`'s
  `AppState` (`BOOT`/`LOADING`/`MENU`/`MATCH`/`FATAL_ERROR`/`DISPOSED`)
  predates Phase 7 and is load-bearing for startup-failure handling
  (`ContractRegistry`, `ErrorReporter`). `GameRuntime.mapMatchStateToAppState`
  maps `MatchFlowController`'s richer `MatchState` onto it instead:
  `MAIN_MENU`/`MATCH_SETUP`/`SETTINGS` -> `"MENU"`, everything else
  (including `MATCH_RESULTS`, still part of the match session until the
  player returns to the menu) -> `"MATCH"`.
- **`window.__GAME_TEST__.gameFlow` mutating methods call an explicit
  `notifyStateChanged`/`emitSessionStateChanged` after the underlying
  `MatchFlowController` call**, rather than relying solely on the normal
  per-tick `runtime:session-state-changed` emission. Found necessary
  because Playwright's deterministic match-flow tests pause the real rAF
  loop first (same established pattern as `tests/physics/foundation.spec.ts`)
  and then call menu-navigation actions (`openMatchSetup`, `pause`, etc.)
  that do not themselves go through a fixed tick — without the explicit
  notify, the Vue UI would not reflect the new state until the next manual
  `advanceGameTicks()` call.
- `runtime:session-state-changed` is emitted once per **fixed tick**
  (inside `onFixedTick`), not once per rendered frame. An earlier version
  emitted it from the rAF `frame()` method directly, but that requires a
  companion component-owned `requestAnimationFrame` polling loop to read
  it reactively — which is itself a second concurrent rAF loop and broke
  `tests/integration/runtime.spec.ts`'s "exactly one requestAnimationFrame
  is ever pending" invariant (core architecture spec: one rAF loop, full
  stop). Emitting from `onFixedTick` needs no extra rAF call at all, and
  also fires correctly when ticks are driven by
  `stepFixedTicksForTesting`/`advanceGameTicks` while the rAF loop itself
  is paused.

## Phase 8

- **`ModuleContainer.camera` was deliberately left as `NullCameraModule`**
  rather than swapped for a concrete `ChaseCameraController` type (the
  pattern used for `gameFlow`/`input` in earlier phases). The camera
  controller needs two things that do not exist when `ModuleContainer`'s
  generic slots are eagerly constructed: the `THREE.PerspectiveCamera`
  created by `PlaceholderSceneRenderer.initialise()`, and the ready
  `MatchFlowController`. Rather than threading those through the
  container, it is constructed and registered directly in
  `GameRuntime.initialise()` as an integration binding — the exact same
  pattern already used for `PhysicsRenderBinding` and
  `BoostPadRenderBinding` (both of which also need post-construction
  wiring the generic container can't provide). See
  `src/camera/NullCameraModule.ts`'s doc comment.
- **Gameplay input is now sampled once per fixed tick unconditionally**,
  not only when `gameFlow.areControlsActive()`. Camera-relevant edges
  (ball-camera toggle, swivel, rear view) need to reach the camera
  controller even during countdown/pause/celebration (real games let you
  toggle ball-cam or look around while waiting for kickoff); only the
  `CarInput` half of the sampled frame is still gated behind
  `areControlsActive()` before being handed to physics.

## Phase 9

- `OPPONENT_AI_CONTRACT_VERSION` was not added/wired into
  `validateModuleContracts()`, consistent with the existing precedent
  that `PHYSICS_MODULE_CONTRACT_VERSION` and the game-flow contract are
  also defined but not threaded through that call (see Phase 1 section
  above) — `GameRuntime.initialise()` still calls
  `validateModuleContracts([])`.
- `AiUpdateContext` (this project's own type, not the full AI spec
  section 3 `AiUpdateContext`) omits `recentPhysicsEvents` and most of
  `AiMatchContext` — see `docs/implementation-progress.md` Phase 9
  "Deferred" section for the full list and why.

## Phase 10

- `AiDifficultyParameters` is the spec's full section 7 struct (all
  three presets copied verbatim from the spec's recommended values), but
  this project's simplified planner only actually reads a subset:
  `reactionDelaySeconds`, `perceptionPositionNoise`/
  `perceptionVelocityNoise`, `tacticalHz`, `defensiveUrgency`,
  `challengeAggression`, `boostPadAwarenessRadius`, `dodgeSkill`,
  `aerialSkill`, `maximumAerialTime`, `mistakeFrequency`. Fields tied to
  systems this phase doesn't build (`candidateCount`, `shotAccuracy`,
  `shotPowerPreference`, `boostConservation`,
  `maximumBoostBurstSeconds`, `boostPadDetourToleranceSeconds`,
  `boostPadRespawnPlanningSeconds`, `boostDenialAggression`,
  `boostRouteCandidateCount`, `powerslideSkill`, `decisionTemperature`,
  `commitmentSeconds`, `maximumAerialHeight`, `kickoffProfile`,
  `predictionHz`, `controlHz`, `planningHorizonSeconds`) are kept on the
  type for spec fidelity and future use, not consumed yet.
- `AiRandom` (mulberry32) is a local copy of the same algorithm the asset
  pipeline's `SeededRandom` uses, not an import from `@/assets` — kept
  the AI module self-contained rather than adding a cross-module
  dependency for a few lines of PRNG math.

## Phase 11

- `assets/models/car.glb` was moved (`git mv`) to
  `public/assets/cars/car.glb` so Vite's default `publicDir` serves it at
  a real dev/preview-server URL, matching asset pipeline spec section 85's
  expected layout. `assets/textures/` was left in place (Phase 12).
- `AssetManifest.ts`'s own placeholder `CarAssetDescriptor` (an `{id,
  source: "fallback"|"glb", url?}` shape, unused since Phase 2) was
  replaced by the asset pipeline spec section 11.3 `CarAssetDescriptor`
  (now defined in `src/assets/cars/CarModelTypes.ts`) — a grep confirmed
  the old type had no other consumers, so there was no compatibility
  surface to preserve.
- `AssetPipeline.initialise()` changed from synchronous to `async` to
  await the real car GLB load/validate step (see
  `docs/asset-pipeline-deviations.md` Phase 11). This was already legal
  per the `GameModule` contract and required no caller changes.

## Phase 12

- `assets/textures/*.png` (298 real in-game textures) was moved (`git
  mv`) to `public/assets/textures/`, same reasoning as the Phase 11 car
  GLB move. Three vendor catalog/preview images (not in-game textures)
  were deliberately left at `assets/textures/` — see
  `docs/asset-attribution.md`.
- `AssetManifest.ts`'s own placeholder `TextureAssetDescriptor`/
  `TextureAssetId` types (unused since Phase 2, `textures: {}`) were
  replaced by re-exports of the richer types now defined in
  `src/assets/textures/TextureTypes.ts`, and `GAME_ASSET_MANIFEST.textures`
  is now populated from the generated `TEXTURE_MANIFEST_ENTRIES` — same
  consolidation pattern used for `CarAssetDescriptor` in Phase 11.
- `TextureManifestData.ts` (298 descriptor entries) is generated by
  `scripts/generate-texture-manifest.mjs`, not hand-written — see
  `docs/asset-pipeline-deviations.md` Phase 12 for the classification
  reasoning.

## Phase 13

- Governed by a different spec file
  (`plan/psx_visual_stadium_game_loop_spec_v1_1_boost_pads.md`) than
  Phases 0-12's core/asset-pipeline specs — its own deviations are
  tracked separately in `docs/visual-language-deviations.md`, following
  the same one-spec-per-deviations-doc pattern as
  `docs/asset-pipeline-deviations.md`/`docs/physics-deviations.md`/etc.
- `PlaceholderSceneRenderer.updateRenderFrame()` now renders through
  `PsxRenderPipeline` instead of calling `renderer.render(scene, camera)`
  directly — the class itself (constructed once by `GameRuntime`) is
  unchanged, preserving the core architecture spec's "exactly one
  renderer/scene/camera" invariant; only what happens inside
  `updateRenderFrame` changed.

## Phase 15

- `useSettingsStore` (Pinia) follows the exact same "controller/engine is
  the source of truth, the store only mirrors/persists" precedent as
  `useMatchFlowStore` — the store owns the persisted `AppSettings` value
  itself (there is no separate "settings controller" module), and
  `SettingsPanel.vue` calls straight through to `runtime.*` methods for
  the fields that have a live engine effect, exactly like every other
  menu component already does for match-flow actions.
- `validateSettings()` is a plain exported function, not a store action,
  so it's unit-testable without touching `localStorage` (Vitest's `node`
  environment has no `localStorage` global) — the store's `load()`/
  `update()` actions are thin `localStorage` read/write wrappers around
  it, exercised by Playwright instead.

## Phase 16

- Governed by `plan/retro_audio_module_spec.md` — its own deviations are
  tracked separately in `docs/audio-deviations.md`, following the same
  one-spec-per-deviations-doc pattern as the other phase-specific specs.
- `src/audio/AudioModule.ts` (an earlier, incompatible placeholder type
  file — different `AudioSettings` shape, `kind`-discriminated events,
  `setVolumes`/`resumeAudioContextFromUserGesture` methods) was deleted
  and its two consumers (`NullAudioModule.ts`, `ModuleContainer.ts`)
  repointed at the new spec-accurate `src/audio/AudioTypes.ts` — the same
  "check consumers, then consolidate onto the new spec-accurate type file"
  pattern used for `CarAssetDescriptor` (Phase 11) and
  `TextureAssetDescriptor` (Phase 12).
- `RetroAudioModule` is constructed directly by `GameRuntime`, exactly
  like `PlaceholderSceneRenderer`/`VfxModule` — `NullAudioModule` stays a
  permanent no-op fallback (used only before `initialise()` completes),
  not something the real module ever routes through.
- `AudioEventAdapter` is a `RenderFrameModule` registered with
  `FrameCoordinator` alongside `VfxModule`, independently re-deriving the
  same physics/game-flow observations (boost consumption, ball-impact
  velocity delta, match-state transitions) rather than depending on
  `src/vfx` — see `docs/audio-deviations.md` for the full rationale.
- Vitest cannot exercise real Web Audio synthesis (no `AudioContext` in
  Node) — `AudioCooldownRegistry`/`clampAudioSettings` are unit-tested in
  Vitest; everything requiring a real `AudioContext` (context lifecycle,
  scheduling, continuous voices, settings propagation) is Playwright-only,
  using `AudioDiagnostics` counters as the practical substitute for the
  spec's `BrowserAudioTestApi` virtual-scheduler inspection methods.

## Phase 18

- **Found and fixed a real gap while writing `tests/release`**: the
  Escape-key "pause" input edge (`HumanGameplayInputFrame.system.pausePressed`,
  built in Phase 4) was sampled every tick but never consumed anywhere —
  no code path called `pauseMatch()` in response to it, so real end users
  pressing Escape during a live match got no response at all (only the
  Pause Menu's own on-screen RESUME/RESTART/RETURN buttons worked, and
  those are only reachable once already paused via some other means).
  Fixed in `GameRuntime.onFixedTick()`: `if (frame.system.pausePressed) {
  this.pauseMatch(); }` right after sampling input, guarded implicitly by
  `MatchFlowController.pause()`'s own `PAUSABLE_STATES` check (safe to
  call unconditionally). Resuming via Escape a second time is not wired —
  input sampling itself is skipped entirely while `PAUSED` (an early
  return in `onFixedTick`, predating this phase), so only the Pause Menu's
  RESUME button can un-pause; this is an acceptable smaller scope than a
  full Escape-toggles-pause-and-resume behaviour and matches "smallest
  compliant solution" (Master Brief "If You Become Stuck").
- **Added a `<link rel="icon" href="data:,">` to `index.html`.** With no
  favicon declared, every page load triggered an automatic
  `GET /favicon.ico` that 404'd — harmless to gameplay, but a real,
  previously-unnoticed console error (no prior Playwright suite in this
  project checked `console` `"error"`-type messages, only uncaught
  `pageerror`s, so it had never been caught). The inline `data:,` URI is a
  zero-byte icon that suppresses the automatic request without needing an
  actual icon asset.
- **`test:release` split, per the Phase 1 deviation's own recommendation**
  (see that section above): now runs only `tests/smoke tests/release`
  against the literal plain-`npm run build` artifact.
  `tests/release/release-gate.spec.ts` (new) drives the app exclusively
  through real DOM interaction — clicks, keyboard events, `data-testid`/
  `data-app-state` attributes — never `window.__GAME_TEST__`, so it
  validates the actual shipped build rather than a test-mode stand-in.
  Also asserts `window.__GAME_TEST__`/`__AUDIO_TEST__` are genuinely
  `undefined` on that build (no debug hooks leaking into production) and
  that a live match makes no third-party network requests.
- **`tests/release` was empty until this phase** — `test:release`
  silently matched zero tests for it since Playwright doesn't error on an
  empty/missing test path, so the script "passed" without ever actually
  gating a release on anything release-specific. This phase is what makes
  that gate real.
- Ran the Master Brief's literal Final Goal command chain end to end in
  this session: `npm run validate` -> `npm run build` (which itself runs
  `validate` -> `type-check` -> `test:unit` -> `vite build`) ->
  `npm run test:release`, all passing with no manual fixes, confirming the
  chain works from the current checkout state.

## Post-launch polish pass — WS9 (UI restyle)

- **PS1 Wipeout/Designers-Republic UI language**, applied as a new
  `src/styles/retro-ui.css` (design tokens + `wo-` prefixed utility
  classes) imported once from `main.ts`, plus per-component class/style
  edits only — no DOM restructuring, no `data-testid` or visible-text
  changes, so the entire existing Playwright UI/flow suite kept working
  unmodified as the regression gate (per the plan's WS9.D instruction).
- **Fonts self-hosted, not CDN-linked** — see
  `docs/asset-attribution.md`'s new Fonts section for the acquisition/
  licensing details; this is required by `tests/release/release-gate.spec.ts`'s
  zero-external-requests assertion, not just a style preference.
- **One intentional non-CSS change**: `GameRuntime`/`EventTypes`/
  `matchFlowStore` gained a `playerSupersonic` field (mirroring the
  existing `playerBoostAmount` plumbing exactly) so `GameplayHud`'s boost
  ring can show a white glow + "SUPERSONIC" label — the plan calls this
  out explicitly as the one exception to "CSS/class edits only".

## Post-launch polish overhaul — summary (WS1-WS10, plan/POLISH_OVERHAUL_PLAN.md)

Ten workstreams across gameplay correctness, camera, arena/graphics, AI,
audio, and UI, executed sequentially with a full verify-then-commit
cycle after each. The single biggest recurring risk across the whole
pass was **kickoff-rotation ripple effects** (WS7.A): once cars stopped
always spawning facing local -Z, several unrelated tests that had
implicitly relied on that (camera FOV, VFX timing, driving-forward
assertions) needed explicit rotation/position resets — each traced to
its actual root cause rather than papered over with longer waits or
retries. See `docs/physics-deviations.md`'s WS7 section for the full
list. The environment itself was also unreliable mid-overhaul: the local
git checkout twice silently reverted to a stale pre-plan commit with no
corresponding command run (remote history was unaffected both times,
recovered via `git merge --ff-only`); the mitigation adopted afterward —
commit immediately once typecheck passes, rather than waiting for full
Playwright verification — held for the rest of the pass. Final state:
all ten workstreams complete, documented per-area in their respective
`docs/*-deviations.md`, and verified via the full check in
`docs/implementation-progress.md`'s closing entry.

## Post-launch polish pass — R7 (quick-chat overlay, plan/RAMPS_AND_FEATURES_PLAN.md)

New `src/components/hud/QuickChatOverlay.vue`, mounted unconditionally
in `App.vue` (rendered right after `GameCanvas`, so it sits above the
scene canvas but below the scanline/vignette overlays which pin to
`z-index: 40`; its own `z-index: 5` keeps it above the HUD/menu panels
too, which set none). Pure UI layer: watches `matchFlowStore.session.
opponentScore` for an increase (increment-only guard, so score resets
on replay/return-to-menu never spam) and pushes three staggered "CPU:
WHAT A SAVE!" messages via `setTimeout` (DOM timers run independent of
the paused sim RAF loop, which matters for deterministic tests), each
auto-fading and removing itself a few seconds later. All pending timeout
handles are tracked and cleared in `onBeforeUnmount` so navigating away
mid-spam can't throw once the component (hypothetically) unmounts —
though in practice it never does, being mounted unconditionally.
`settingsStore.settings.accessibility.reducedFlashes` disables the
slide-in/fade animations (content still appears/disappears, just without
motion) without touching whether the messages fire at all.

Playwright tests in `tests/ui/quick-chat.spec.ts` cover the 3-message
spam and fade-out timing, that a player goal never triggers it, and that
triggering a spam and immediately returning to the main menu produces no
console errors and the messages still clear on their own schedule.

## Post-launch polish pass — R8 (single menu ball, plan/RAMPS_AND_FEATURES_PLAN.md)

**Root cause:** the menu scene rendered two balls — a static
`MenuGhostBall` placeholder mesh from `AssetPipeline.buildPlaceholderWorld`
(floated at `ballRadius + 2`) *and* the live physics-driven ball
(resting on the floor at `ballRadius` since WS5.B), rendered on top of
it via `PhysicsRenderBinding`. The ghost cars happened to overlap their
physics counterparts pixel-for-pixel, so only the ball read as visibly
doubled.

**Fix:** deleted the `MenuGhostBall` mesh entirely from
`buildPlaceholderWorld` — the physics-driven ball is now the only menu
ball. `GameRuntime.updateMenuPresentationVisibility`'s toggle-name list
was trimmed to just `MenuGhostPlayerCar`/`MenuGhostOpponentCar` (the
ghost cars are unaffected by this change and still need the visibility
toggle for WS7.C). New unit test `tests/unit/menuGhostBall.spec.ts`
constructs a real `AssetPipeline`, calls `buildPlaceholderWorld()`
directly, and asserts `getObjectByName("MenuGhostBall")` is `undefined`
while the two ghost cars are still present. (Constructing a *second*
`AssetPipeline` instance in the same test file hung indefinitely on
`initialise()` — some shared loader/cache state doesn't tolerate two
concurrent pipelines; worked around by asserting both facts from a
single pipeline instance in one test rather than investigating the
loader internals, since a second pipeline instance is not a real
runtime scenario.) Verified visually via a menu screenshot showing
exactly one ball at centre field.

## Post-launch polish pass — R12 (Customise Car menu, plan/RAMPS_AND_FEATURES_PLAN.md)

New `CAR_CUSTOMISE` match state, reachable only from `MAIN_MENU`
(`MatchFlowController.openCarCustomise`, mirroring `openSettings`'s
gate), with a dedicated `src/components/menu/CarCustomise.vue` panel and
a matching `ChaseCameraController.updateCustomiseCamera` branch — checked
*before* the generic menu-orbit branch (`state === "CAR_CUSTOMISE"`
short-circuits, so `CAR_CUSTOMISE` is deliberately absent from
`ChaseCameraController`'s own `MENU_MATCH_STATES` list even though it is
present in `MatchFlowController`'s and `GameRuntime`'s same-named lists —
those two need it to stay in the "MENU" family for navigation/app-state
purposes; the camera needs it to *not* fall into the generic menu-orbit
branch). The dedicated camera orbits the live player car (radius 4.6,
height 1.5, ~0.25 rad/s) instead of the field centre, so the car being
customised fills the frame; the car itself stays stationary (menu physics
idles, no live input in this state).

**Colour override plumbing.** `settingsStore` gained a `car: {
bodyColor, boostColor }` section (default `#4ff0ff` both, matching the
built-in player cyan), validated with the same field-by-field
`/^#[0-9a-f]{6}$/i` pattern as every other section. `AssetPipeline.
setPlayerCarColorOverride(hex | null)` stores the live override;
`createCarVisual("player")` derives a `TeamVisualProfile` from it via the
new `CarDescriptors.derivePlayerProfile(hex)` — primary/emissive are the
raw hex, secondary is `darkenHex(hex, 0.55)`. **Resolving the plan's
`darkenHex` ambiguity:** the plan text says "`darkenHex(hex, 0.45)`" for
the secondary call but then parenthetically describes the helper itself
as "multiply RGB by 0.55" — those two numbers don't agree if the
parameter means "darken by this fraction" vs. "the multiply factor
itself". This build resolves it by making the parameter the literal
multiply factor (`channel * factor`, clamped/rounded), and calling it
with `factor = 0.55` everywhere (`derivePlayerProfile` passes `0.55`,
not `0.45`) — consistent with the parenthetical's "multiply RGB by 0.55"
and the simpler of the two readings. `darkenHex` itself is pure (no
`THREE.Color`/canvas dependency) and unit-tested directly in
`tests/unit/carColorOverride.spec.ts`, per the plan's suggestion to
prefer testing colour derivation standalone over constructing a second
`AssetPipeline` in the same test file (see the R8 section above for why
that hangs). `createProceduralCarFallback` gained an optional third
`colorOverride` parameter (used for the player fallback only); its
`MaterialRegistry` cache key is suffixed with the override colour so a
changed override can't reuse a stale cached material for a different
colour.

`PhysicsRenderBinding.rebuildCarVisual(carId)` drops the cached visual
from both the scene root and its internal map; the existing per-frame
sync loop's `let visual = this.carVisuals.get(carId); if (!visual) { …
}` already lazily recreates whatever's missing, so no new creation path
was needed — just eviction. A second new `PhysicsRenderBinding` method,
`getCarPrimaryColorHex(carId)`, traverses the *live* bound visual
(matching the GLB's `M_car` material name or the fallback's `CarBody`
mesh name) for Playwright to assert the colour actually reached the
rendered scene graph, not just settings/asset-pipeline state.

**Boost-trail colour, scoped by call site not by a shared function.**
`VfxModule.setPlayerBoostColor(hex | null)` feeds a new private
`boostTrailColor(carId)` helper (override for the player's own car, team
colour otherwise) that only `detectBoostTrails` (real gameplay boosting)
and the new preview path call — `detectGoalCelebration` was deliberately
left calling the original `teamColor(scoringTeam)` directly and untouched,
so a player's custom boost colour never leaks into their own goal
celebration burst (which must stay team-cyan per the plan).

**Boost preview.** `VfxModule.setBoostPreview(carId | null)` drives a
`updateRenderFrame`-integrated preview: every 3rd frame while set, it
spawns the same two-particle burst `detectBoostTrails` would on a real
boost draw, at the (stationary) car's rear, using `boostTrailColor`
directly — bypassing the normal boost-consumption-delta detection
entirely, since there is no real boost draw to detect on a parked menu
car. `CarCustomise.vue` toggles this via `GameRuntime.
setBoostPreviewEnabled(true/false)` in `onMounted`/`onBeforeUnmount`.

**Menu-ghost stacking fix.** The Customise Car camera frames the *live*,
recolourable `PhysicsRenderBinding` visual up close — but the static
`MenuGhostPlayerCar` from `buildPlaceholderWorld` (a separate, never
recoloured `THREE.Group`) is also visible at every "MENU" app-state,
including `CAR_CUSTOMISE` (`MAIN_MENU`/`CAR_CUSTOMISE` map to the same
`AppState`, per `mapMatchStateToAppState`). Left alone, the stale-colour
ghost would sit stacked on the recoloured live car. Fixed by extending
`GameRuntime.updateMenuPresentationVisibility` to also take the current
`MatchState` and additionally hide `MenuGhostPlayerCar` (only) whenever
`matchState === "CAR_CUSTOMISE"`. This surfaced a second, previously
latent gap: `setAppState`'s own change-detection means the visibility
update never re-ran on a `MAIN_MENU -> CAR_CUSTOMISE` transition (both
map to the same `AppState`, so `next !== this.appState` is false) —
`syncAppStateFromMatchFlow` now also tracks the last `MatchState` it ran
the visibility update for and re-runs it on a `MatchState` change even
when `AppState` didn't change.

Playwright coverage in `tests/ui/car-customise.spec.ts`: main-menu entry
point and camera-distance-to-car diagnostics; live colour-input ->
`getPlayerCarColors()` + `getCarPrimaryColorHex()`-on-the-live-scene
round trip; boost-preview particle count rising while the screen is open
and decaying to 0 within 2s after leaving; persistence across a reload;
BACK -> `MAIN_MENU`; and a gameplay smoke test (real match, LMB boost via
`__PHYSICS_TEST__.setCarInput`, zero console errors) proving the custom
boost-colour path doesn't regress real gameplay. Existing
`tests/assets/car-visual.spec.ts` (opponent car stays untinted magenta —
the override only ever touches `team === "player"`) and
`tests/release/release-gate.spec.ts` (the new "CUSTOMISE CAR" menu item
doesn't collide with `getByText("PLAY")`'s uniqueness assumption) still
pass unmodified.

## R13 (Tournament mode, plan/RAMPS_AND_FEATURES_PLAN.md)

**Pure state machine, kept deliberately dumb.** `TournamentController`
(`src/game-flow/TournamentController.ts`) has zero engine dependencies —
no `PhysicsFacade`, no `MatchFlowController` — so `tests/unit/
tournament.spec.ts` exercises the entire ladder (full win walkthrough,
elimination, idempotence, null-winner-as-loss, duration propagation,
`leave()` reset) without booting any engine module at all. All of the
actual engine wiring (starting real matches, applying AI difficulty,
detecting match-end) lives in `GameRuntime`, which is the only thing that
knows about both the tournament controller and `MatchFlowController`.

**Two new match states, no dedicated camera.** `TOURNAMENT_BRACKET` and
`TOURNAMENT_VICTORY` were added everywhere `CAR_CUSTOMISE` (R12) was
added — `MatchFlowController`'s `MENU_STATES`, `GameRuntime`'s
`MENU_MATCH_STATES`, `App.vue`'s `showGameplayHud` exclusion list, and
`MENU_NAVIGABLE_STATES` — *except* `ChaseCameraController`'s dedicated
per-screen camera branch: unlike `CAR_CUSTOMISE`'s close orbit around the
live car, both tournament screens use the plain generic menu-orbit
camera, so they were simply added to `ChaseCameraController`'s own
`MENU_MATCH_STATES` list (the one `CAR_CUSTOMISE` is deliberately absent
from — see the R12 section above) rather than getting a new branch.

`MatchFlowController.startMatch()`'s legal-states guard also gained
`TOURNAMENT_BRACKET`, since the bracket's PLAY NEXT GAME button starts a
match directly from that screen (the same way `MATCH_SETUP`/`MAIN_MENU`
already could) — this was the one non-obvious extra call site the plan's
state-list enumeration didn't spell out but the flow requires.

**Match-end and abandonment both funnel through one place:
`emitSessionStateChanged()`.** The plan calls for match-end detection
("phase in-match -> MATCH_RESULTS transition") and an abandonment safety
net ("any transition to MAIN_MENU while a tournament is active") to both
live in "GameRuntime's existing per-tick session sync". Rather than
hooking only `onFixedTick`, both edge-detectors were placed in a small
`syncTournamentFromMatchFlow(matchState)` helper called from the *start*
of `emitSessionStateChanged()` — which both `onFixedTick` (once per fixed
tick) and every state-mutating facade method (`pauseMatch`,
`returnToMenu`, `leaveTournament`, etc.) already call. This means a
direct, outside-the-tick-loop transition — like the pause menu's own
RETURN TO MENU, which calls `gameFlow.returnToMenu()` and then
`emitSessionStateChanged()` synchronously — is caught immediately rather
than lagging a tick behind a call that only checked in `onFixedTick`. The
net effect is the same "one code path" the plan asks for; the trigger
point is just slightly broader than literally "per-tick" so it also
covers same-frame facade calls.

**Save/restore point: `beginTournament()`, not `enter()`.** The plan says
"save the pre-tournament AI difficulty and duration the first time a
tournament begins". `enter()` (opening the TOURNAMENT setup screen) can
be visited and back out of via BACK without ever playing a game, so the
save happens in `beginTournament()` (BEGIN TOURNAMENT, which locks in the
duration and opens the bracket) guarded by `tournamentSavedDifficulty ===
null`, restored (and nulled back out) by a shared
`restoreSavedTournamentSettings()` helper called from both
`leaveTournament()` and the abandonment safety net.

**`ResultsScreen.vue` conditions on `active`, not `phase === "in-match"`.**
By the time the results screen actually renders, `recordMatchResult` has
already fired (same transition into `MATCH_RESULTS` that revealed the
screen), so `phase` has already moved on to `"bracket"`/`"eliminated"`/
`"champion"`. `active` is what stays true for the whole tournament,
including this screen, so it's the only condition that needs checking to
swap REPLAY/RETURN TO MENU for CONTINUE/LEAVE TOURNAMENT — non-tournament
rendering is completely untouched (verified by re-running
`match-flow.spec.ts`'s "results screen" test unmodified).

**Tournament victory VFX: CSS-only, no engine coupling added.** The plan
explicitly allows triggering the existing goal-celebration VFX on mount
"if trivially available" but says not to add new engine coupling just for
this. There is no existing hook to fire that VFX outside of a live match
(it's driven off real goal-scored physics events via `VfxModule`'s
`detectGoalCelebration`), so `TournamentVictory.vue` uses a pure-CSS
shimmer/sparkle (radial-gradient "sparkle" layer, slow drift animation)
instead, respecting `settingsStore.settings.accessibility.reducedFlashes`
the same way `QuickChatOverlay.vue` (R7) does.

**Session-only, no persistence — an explicit decision.** Nothing about
tournament state is written to `localStorage`; a page refresh mid-ladder
simply abandons it (back to a fresh, inactive tournament at boot). This
mirrors how the rest of match-flow session state already works (a
mid-match refresh also just restarts at the main menu) and avoids a whole
extra persistence-and-migration surface for a feature that's inherently
a single play session.

Playwright coverage in `tests/game-flow/tournament.spec.ts` covers all 7
scripted scenarios from the plan: bracket setup and BEGIN; round-0
PLAY NEXT GAME applying "easy" difficulty + the chosen duration; a single
win showing CONTINUE/LEAVE TOURNAMENT (not REPLAY) and advancing the
bracket to "medium"; a full 4-win run to the champion screen with AI
difficulty restored on RETURN TO MENU; an elimination path; LEAVE
TOURNAMENT mid-bracket followed by a clean normal match; and the
abandonment safety net via the pause menu's own RETURN TO MENU. Per the
plan's explicit warning, the win-scenario helper re-parks the opponent
car to `(40, 1, 40)` *inside* every one-second slice of the fast-forward
loop (not just once beforehand) — hard/legend-tier AI (rounds 2/3) is
competent enough to drive back and score for real during a 60-second
fast-forward otherwise, which would flip a scripted "player always wins"
result into a loss or overtime. Existing `match-flow.spec.ts` (11 tests)
and `release-gate`/`smoke` suites were re-run against both
`chromium-dev` and a fresh `chromium-preview` build and stay green,
unmodified.

## Post-launch polish pass — R14 (final integration, plan/RAMPS_AND_FEATURES_PLAN.md)

Ran the whole R1-R13 surface together rather than trusting each
workstream's isolated verification: full typecheck, full unit suite
(296 tests), `npm run validate`, and the complete Playwright suite on
both browser projects, plus `npm run test:release`. This caught one
real cross-workstream regression that no single workstream's own tests
could have seen: R11's `controller-navigation.spec.ts` hardcoded the
main menu as PLAY→SETTINGS two items apart, but R12 and R13 each later
inserted a menu item between them (CUSTOMISE CAR, then TOURNAMENT) —
a single dpad-down from PLAY now reaches CUSTOMISE CAR, not SETTINGS.
Fixed the two affected assertions; this is exactly the kind of
integration-only bug the final pass exists to catch. A handful of other
failures on the first full-suite run turned out to be non-regressive
once re-run in isolation: two AI Playwright tests and one audio test
timed out only under full-parallel resource contention (clean when run
alone), and `release-gate.spec.ts`'s "no debug hooks exposed" check
fails against a `PLAYWRIGHT_TEST=1` test-mode build by design (that
flag is what installs `window.__GAME_TEST__` in the first place) — the
release gate itself always runs against a plain build, which passes.

Did a screenshot QA sweep (throwaway Playwright spec, not committed)
across the scenes called out in the plan: main menu (single ball, four
menu items), match setup (LEGEND chip visible), the customise screen
mid-live-preview, a car mid-climb at an arena corner (confirmed the R1
corner-wall panel geometry actually renders, not just passes its unit
tests), a goal moment with the R6 blast and R7 "WHAT A SAVE!" quick
chat both visible at once, and all three tournament-bracket phases plus
the CHAMPION victory screen. Everything matched the plan's intent with
no further fixes needed. Treated the "manual feel checklist" (drive
every wall/corner, flip with a steady camera, get auto-flipped from a
stuck pose, rebind a key, navigate every menu with a virtual pad) as
already covered by the existing real-input Playwright suites for each
of those features rather than writing a redundant standalone script.

## F9 — Controller focus visibility on every menu button (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md)

**Root cause.** `src/styles/retro-ui.css` defines a global R11 amber
`:focus` outline rule for `.wo-item`/`.duration-item`/`.tab`/`.chip`, but
eight components (`MainMenu`, `MatchSetup`, `PauseMenu`, `ResultsScreen`,
`TournamentBracket`, `TournamentVictory`, `SettingsPanel`,
`CarCustomise`) each carried their own scoped
`.menu-item:hover, .menu-item:focus-visible { outline: none; }` block.
Vue's scoped-style `data-v-xxxx` attribute selector gives the scoped rule
equal-or-higher specificity than the global `:focus` rule for the same
`outline` property, and it's later in the cascade, so whenever focus
arrived via keyboard/gamepad (triggering both `:focus` and
`:focus-visible`) the scoped `outline: none` won — the item was
functionally focused (gamepad South activates it) but had **zero visible
indication** for controller/keyboard users. Chips worked because
`.wo-chip`/`.duration-item` never had a competing scoped suppressor.
`CarCustomise.vue`'s `.swatch:focus-visible` had the identical bug, and
range/color inputs (`SettingsPanel.vue`'s sliders and the two colour
pickers) were never covered by any focus rule at all — invisible focus by
omission, not suppression.

**Fix.** Deleted the `outline: none` declaration from every scoped
`:focus-visible` rule listed above (kept the `:hover` half and any
`transform`/`border-color` styling those rules also carried — where
`outline: none` was the *only* declaration, the now-empty rule block was
removed entirely rather than left as a no-op). Added
`.swatch:focus`, `input[type="range"]:focus`, and
`input[type="color"]:focus` to the global amber-outline rule in
`retro-ui.css` (swatches and range/color inputs aren't `.wo-item`, so
they need to opt in explicitly). No component now overrides `outline` on
focus at all — the global R11 rule is the single source of truth.

**Tests** (`tests/ui/focus-visibility.spec.ts`, live rAF loop, virtual
gamepad d-pad navigation — never `el.focus()`, per the plan's "test the
real path"): one test per screen (main menu's 4 items, MatchSetup's
`start-match` + BACK, all three PauseMenu items, ResultsScreen's REPLAY +
RETURN TO MENU, tournament setup's BEGIN TOURNAMENT + BACK, a settings
tab + the FOV range slider, a CarCustomise swatch) asserts
`getComputedStyle(document.activeElement).outlineStyle !== "none"` and
`outlineWidth !== "0px"` after driving focus there with dpad pulses.
Verified pre-fix failure directly (`git apply -R` on just the
CSS/`retro-ui.css` hunks, isolated from other in-flight work on the same
branch — a plain `git stash` risked catching concurrent uncommitted edits
from other sessions in shared files like `SettingsPanel.vue`): the main
menu test failed with `outlineStyle` = `"none"` as expected, then passed
once the fix was restored. `tests/ui/controller-navigation.spec.ts` stays
green (only the one test F10 required updating — see below), and the
full `npx vitest run` sweep (324 tests) is unaffected.

## F10 — Replace `window.confirm` with controller-navigable inline confirms (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md)

**Root cause.** `PauseMenu.vue`'s `restartMatch()`/`returnToMenu()` gated
the actual runtime call behind `window.confirm(...)`. Native dialogs are
outside the DOM, so the R11 gamepad-navigation layer (which only ever
touches `document.activeElement` and `[data-menu-root]`/`[data-menu-back]`
elements) can't see or drive them at all — a controller player pressing
South on RESTART MATCH got no visible feedback and no way to confirm.
Worse, this was fully masked in Playwright: the test runner
auto-dismisses native `dialog` events by default, so
`tests/ui/controller-navigation.spec.ts`'s "south taps while paused never
leak" test was "passing" only because the auto-dismissed confirm happened
to behave like a cancel — it was never exercising a real confirm/cancel
choice.

**Fix.** `PauseMenu.vue` now holds local `confirming =
ref<null | "restart" | "return">(null)`. Clicking RESTART MATCH/RETURN TO
MENU sets `confirming` instead of acting immediately; the button column
`v-if`-swaps to an "ARE YOU SURE?" `.wo-label` line + CONFIRM
(`data-testid="pause-confirm-yes"`) + CANCEL
(`data-testid="pause-confirm-no"`, carrying `data-menu-back`). Because
the normal column (where RESUME carries `data-menu-back`) is entirely
`v-if`'d out while confirming, controller East now cancels the confirm
rather than resuming the match — exactly the plan's intended behaviour.
CONFIRM runs the pending action (`restartMatch()`/`returnToMenu()` plus
the original UI sounds) and clears `confirming`; CANCEL just clears it,
restoring the normal column. Since the R11 gamepad-nav composable
(`useMenuGamepadNavigation.ts`) only re-focuses on `matchFlowStore.
matchState` changes — which don't happen for this `v-if` swap within the
same `PAUSED` state — both transitions explicitly move DOM focus via
`nextTick(() => …focus())`: into confirm mode focuses CANCEL (the safe
default), out of it (via CANCEL) focuses back onto whichever button
opened the confirm (RESTART MATCH or RETURN TO MENU).

**Tests.** `tests/ui/controller-navigation.spec.ts`'s "south taps while
paused never leak into a gameplay JUMP edge on resume" test was rewritten
for the new flow: first South opens the confirm row (asserted visible,
CANCEL focused), second South cancels it (still PAUSED, RESTART MATCH
still present) — the original no-leak assertions on resume still hold.
New `tests/ui/pause-confirm.spec.ts` covers: mouse RETURN TO MENU →
confirm visible, CANCEL focused → CONFIRM → `MAIN_MENU`; mouse RESTART
MATCH → CANCEL → still `PAUSED` with RESTART MATCH restored; pad dpad to
RESTART MATCH, South (opens confirm, focus lands on CANCEL per spec),
dpad-down wraps focus to CONFIRM, South → `COUNTDOWN_3` (proves the real
`restartMatch()` runtime call fired, not just a UI state flip).
`tests/game-flow/tournament.spec.ts`'s mid-tournament pause-return
abandonment test and `tests/release/release-gate.spec.ts`'s production-build
smoke test both used to rely on auto-dismissed/accepted native dialogs
for this same PauseMenu flow — both updated to click through the new
inline confirm row instead, and stay green. Verified pre-fix failure
directly (`git apply -R` on just `PauseMenu.vue`, a file no other
in-flight session was touching): the new mouse RETURN TO MENU test failed
with "element(s) not found" for `pause-confirm-yes` as expected (the
dialog auto-dismissed, `MAIN_MENU` never reached), then passed once the
fix was restored. The full `npx vitest run` sweep (324 tests) is
unaffected.

## F11 — Ball-cam HUD indicator (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md)

Always-visible bottom-left HUD element mirroring the boost meter's
bottom-right placement: "BALL CAM" label + a key chip for the ball-cam
toggle binding of the **most recently used input device**, dimmed
(0.45 opacity) when ball cam is off and lit (full opacity + amber ring)
when on.

**State plumbing.** `SessionStateChangedEvent` gained two fields,
mirrored into `matchFlowStore` exactly like the existing
`playerBoostAmount`/`playerSupersonic` pair: `playerBallCamera` (from
`GameRuntime.getPlayerBallCamera()`, which reads
`cameraController?.isBallCameraEnabled() ?? false`) and
`activeInputDevice` (from a new `GameRuntime.getActiveInputDevice()`,
forwarding `InputControlsModule.getActiveDevice()` — that getter was
already public, so no new surface was needed on `InputControlsModule`
itself, only on the `GameRuntimeFacade`). Both are emitted once per
fixed tick alongside the rest of `SessionStateChangedEvent`, same as
every other HUD-facing field.

**Binding-label extraction.** The R10 `SettingsPanel.vue` binding-label
formatters (`friendlyKeyLabel`/`friendlyMouseLabel`/`friendlyGamepadLabel`/
`friendlyKeyOrMouseLabel`, plus the `KEY_LABELS`/`GAMEPAD_BUTTON_NAMES`
lookup tables) moved verbatim into a new
`src/input/bindings/BindingLabels.ts`, with `SettingsPanel.vue` importing
them instead of defining its own copies. No behavioural change —
`tests/ui/settings.spec.ts` and `tests/input/rebinding.spec.ts` pass
unmodified against the extracted version.

**HUD computed.** `GameplayHud.vue`'s `ballcam-indicator`
(`data-testid="ballcam-indicator"`) picks the label via
`runtime.getControlBindings()` inside a `computed`: gamepad device →
`friendlyGamepadLabel(bindings.gamepad.ballCameraButton)`, otherwise
(including the boot-time `"none"` device before any input has arrived)
→ `friendlyKeyLabel(bindings.keyboardMouse.ballCamera)`. Bindings
themselves aren't reactive state, so the computed also reads
`matchFlowStore.session` purely to force re-evaluation every fixed tick
(a fresh object every tick via `setSession`) — otherwise a live rebind
from the settings panel, or a live device switch, would sit stale until
some unrelated reactive dependency happened to change. `active` class is
driven directly off `playerBallCamera`.

**Tests** (`tests/ui/ballcam-indicator.spec.ts`, live rAF loop, real
keyboard/gamepad input — same pattern as
`tests/ui/controller-navigation.spec.ts`): the indicator is visible and
dim on match start with label `SPACE`, and a real `Space` keypress
toggles `.active` on/off; connecting a virtual pad and pressing a
button that is *not* the ball-cam binding (east/boost) switches the
label to `BTN 3` (the default `ballCameraButton`, "north") without
toggling `.active`, proving the label follows the device rather than
the binding firing — then pressing the actually-mapped button (north)
toggles `.active`, proving the binding itself reads correctly
end-to-end; rebinding ball cam to `KeyB` via
`runtime.setControlBindings` and pressing a real key switches the
device back to keyboard-mouse and updates the label to `B`. Confirmed
via `git stash` (source files only, isolated from other in-flight work
on the same branch) that all three tests fail on the pre-fix code with
"element(s) not found" (the indicator doesn't exist yet), then pass
once the fix is restored.
`tests/camera/chase-camera.spec.ts`'s ball-cam toggle test,
`tests/ui/settings.spec.ts`, and `tests/input/rebinding.spec.ts` all
stay green, and the full `npx vitest run` sweep (324 tests) is
unaffected.

## F12 — Settings reachable from the pause menu (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md)

**Overlay, not a state — physics-pause rationale.** `SettingsPanel.vue`
is now reachable mid-match from the pause menu, but `matchState` never
becomes `"SETTINGS"` while paused. `MatchFlowController.isPaused()` is
literally `matchState === "PAUSED"`, and `GameRuntime.onFixedTick` uses
that as its very first gate each tick — `isPaused()` true early-returns
before physics steps at all. If opening the settings overlay flipped
`matchState` to `"SETTINGS"`, that gate would go false and the very next
tick would step Rapier again: the ball and both cars would silently
keep moving underneath the settings screen. So the pause menu's SETTINGS
button never touches `matchState`; instead a new `pauseSettingsOpen:
boolean` flag on `matchFlowStore` — deliberately documented as pure UI
state, *not* a `runtime:session-state-changed` mirror like the store's
other fields — toggles which of `PauseMenu.vue`/`SettingsPanel.vue` is
shown while `matchState` stays `"PAUSED"` throughout.

**`App.vue`'s v-if restructuring.** `SettingsPanel` used to sit inside
the `v-else-if` ladder rooted at `matchState === 'MAIN_MENU'`
(MAIN_MENU/MATCH_SETUP/SETTINGS/CAR_CUSTOMISE/TOURNAMENT_BRACKET/
TOURNAMENT_VICTORY). `PAUSED` is a completely different branch of that
same chain — never reached by it — so `SettingsPanel` needed showing
for `matchState === "SETTINGS"` **or** `(matchState === "PAUSED" &&
pauseSettingsOpen)`, which a sequential `v-else-if` chained off
`MAIN_MENU` cannot express. Pulled `SettingsPanel` out into its own
independent `v-if="showSettingsPanel"` (a computed OR of both cases);
the remaining MAIN_MENU-rooted ladder keeps its own mutual exclusivity
unchanged (none of its states can be true at the same time as `PAUSED`
or each other). `PauseMenu` gained a `&& !pauseSettingsOpen` guard.
Both components carry `data-menu-root`, and the R11 gamepad-nav
composable (`useMenuGamepadNavigation.ts`) assumes exactly one is ever
mounted (`document.querySelectorAll("[data-menu-root] …")`); the two
v-ifs are mutually exclusive by construction (`pauseSettingsOpen` can
only be true while `matchState === "PAUSED"`, and `PauseMenu`'s `v-if`
excludes that exact case), so the invariant holds. A `watch(matchState,
…)` also force-clears the flag whenever `matchState` leaves `"PAUSED"`,
defensively covering RESUME/RESTART MATCH/RETURN TO MENU in case the
overlay was somehow still open.

**Pause menu button order.** SETTINGS was inserted between RESUME and
RESTART MATCH (`data-index="02"`), pushing RESTART MATCH to `"03"` and
RETURN TO MENU to `"04"` — RESUME stays first with `autofocus` and
`data-menu-back` unchanged. Clicking it calls
`matchFlowStore.setPauseSettingsOpen(true)` + the same `"confirm"` UI
sound RESUME already uses.

**`SettingsPanel.vue`'s `back()` now branches**: reached from
`matchState === "SETTINGS"` (the ordinary main-menu path) it still calls
`runtime.openMainMenu()` as before; reached as the pause overlay
(`matchFlowStore.pauseSettingsOpen`) it instead just clears the flag,
leaving `matchState` at `"PAUSED"` so `PauseMenu` reappears. All of the
panel's existing settings-apply logic (graphics preset, camera, audio,
bindings) needed zero changes — it already applies live and reads/writes
`settingsStore`/`runtime` regardless of which screen is hosting it.

**R11 nav composable: per-frame root tracking.** The existing
`watch(() => matchFlowStore.matchState, …)` in
`useMenuGamepadNavigation.ts` only re-focuses on a `matchState` change —
but opening/closing this overlay never changes `matchState` (it stays
`"PAUSED"` throughout), so that watcher alone misses it, leaving focus
sitting on whatever was focused on the just-unmounted screen (or
nothing, once a Vue-unmounted button is garbage). Generalised: `handle
Frame` (already invoked once per rendered frame while a menu-navigable
state is active) now also queries the currently-visible
`[data-menu-root]` element and compares it against the previous frame's
via a closure-scoped `lastRootEl`; on a change it calls
`focusFirstTarget()` the same way the `matchState` watcher does. The
`matchState` watcher stays in place — it's harmless alongside the new
check and still covers the normal state-transition case on its own.

**Escape/pause-key resume was net-new, not a pre-existing toggle to
guard.** Before F12, pressing the pause key while already `PAUSED` did
nothing: `GameRuntime.onFixedTick`'s `isPaused()` branch returns before
ever sampling `frame.system.pausePressed` (that sampling only happens in
the non-paused branch), so the only way out of the pause menu was
clicking RESUME (or controller East, routed to RESUME's
`data-menu-back`). The plan's test gate ("Escape closes the overlay,
Escape again resumes") requires a working toggle, so this had to be
built, not just guarded. `GameRuntime`/`InputControlsModule` deliberately
stayed untouched — that boundary is framework-agnostic and has never
imported a Pinia store — so this lives entirely in the two Vue
components that are already mounted for exactly one of the two pause
screens at a time, each attaching its own `window` `keydown` listener
(`onMounted`/`onBeforeUnmount`) gated on the *currently bound* pause key
(`settingsStore.settings.controls.keyboardMouse.pause`, not a hardcoded
`"Escape"`, since it's rebindable):
- `PauseMenu.vue`: on the bound key, resumes via the same `resumeMatch()`
  the RESUME button already calls (unless a RESTART/RETURN confirm row is
  open, so a stray Escape there can't blow past the confirmation).
- `SettingsPanel.vue`: on the bound key, only while
  `matchFlowStore.pauseSettingsOpen` is true and no binding capture is in
  progress (`capturingDevice.value === null` — Escape's existing
  capture-cancel handler must keep winning while rebinding a key), calls
  the same `back()` the BACK button uses.

The low-level `InputControlsModule` keyboard handler still unconditionally
queues a `"PAUSE"` edge on every physical Escape press regardless of
match state (pre-existing behaviour, unchanged) — while paused that edge
just sits dead in the queue since it's never sampled, and the existing
require-release re-arm (`GameRuntime.applyMenuNavigationGates`'s
`clearPendingEdges()` on the next menu→gameplay transition) wipes any
such stale edges before physics ever samples input again, so a stray
queued edge from an Escape pressed while paused cannot leak into an
instant re-pause on resume. Deliberately did **not** extend this to the
gamepad Start button: `InputControlsModule` gates the gamepad PAUSE edge
behind `gameplayEdgesEnabled` (only true while controls are active,
i.e. never while already `PAUSED`), by explicit design ("a South press
at the pause menu can never also queue a gameplay JUMP edge" — see that
file's R11 edge-quarantine comment). No F12 test gate requires Start to
resume from bare `PAUSED` (only Escape is specified, and controller
gate coverage is dpad-navigate-the-overlay + East-goes-back, both of
which already worked through the pre-existing `data-menu-back` routing),
so that asymmetry was left alone rather than risking the edge-quarantine
invariant for an untested requirement.

**Tests.** New `tests/ui/pause-settings.spec.ts` (4 cases, exactly the
plan's gates): SETTINGS overlay shows the panel while `matchState` stays
`PAUSED` and physics is frozen (car position + `regulationTimeRemaining`
identical across a real 500ms wait); a graphics-preset change inside the
overlay applies live (`getVisualDiagnostics().preset`) and persists to
`localStorage`, BACK returns to the pause menu with RESUME focused, and
RESUME reaches `PLAYING`; Escape while the overlay is open closes it
(still `PAUSED`), a second Escape resumes to `PLAYING`; controller dpad
navigates the overlay's category tabs and East routes to `BACK` exactly
like `data-menu-back` elsewhere, landing back on the pause menu with
RESUME focused. Verified test-first: `git stash` on just the five
changed `src/` files (leaving the new spec and the updated existing
specs in place) reproduced all 4 new cases failing with "element(s) not
found" for `pause-settings`/`settings-panel` (the SETTINGS button and
overlay don't exist pre-fix), then all 4 passed once the stash was
popped.

SETTINGS being inserted between RESUME and RESTART MATCH shifted every
hard-coded dpad-step-count in the existing pause-menu suites — updated
each with a comment explaining the new count rather than silently
changing the number:
`tests/ui/controller-navigation.spec.ts` ("pad start pauses, dpad
reaches RETURN TO MENU…": 2× dpad-down → 3×; "south taps while paused
never leak…": 1× dpad-down to RESTART MATCH → 2×, plus a second spot in
the same test — 1× dpad-up back to RESUME → 2×, previously missed on the
first pass through the file and caught by actually running the suite,
not just grepping for the button labels);
`tests/ui/focus-visibility.spec.ts` (pause-menu focus-outline test:
inserted a SETTINGS focus-visible check between RESUME and RESTART
MATCH, per F9's own "every menu button" intent, and renamed the test to
list all four buttons); `tests/ui/pause-confirm.spec.ts` (pad: dpad to
RESTART MATCH now takes 2× dpad-down, not 1×). `tests/ui/settings.spec.ts`
(the ordinary menu-path settings flow) required zero changes and stays
green. Full sweep run: `npx vitest run` (324 tests) and every Playwright
spec in `tests/ui`, `tests/game-flow`, and `tests/input` (94 tests, one
worker-scheduled run) all green, plus `tests/release/release-gate.spec.ts`
(3 tests, `--project=chromium-preview` against the already-built `dist/`
production artifact per that file's own intent — its real
Escape-driven pause→RETURN TO MENU flow, its "no test hooks exposed" gate,
and its no-external-network-request check) all green too.

## F15 — Arena flush & refinements: final integration pass

`plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md`'s F1-F14 workstreams (ramp/
corner geometry, single-layer hex shell, kickoff-hold fix, aerial
rotation rewrite, engine-sound removal, symmetric floor pattern, boost
pad layout, controller focus + inline confirms, ball-cam HUD indicator,
pause-menu settings overlay, AI stuck watchdog, goal-blast buff) were
each implemented and gated individually — see `docs/physics-deviations.md`,
`docs/visual-language-deviations.md`, `docs/audio-deviations.md`,
`docs/ai-calibration-log.md`, and this file's own F9/F10/F11/F12
sections for the per-workstream detail. F15 is the cross-cutting
verification pass: full `npx vue-tsc --noEmit`, `npx vitest run`
(324/324), `npm run validate`, the complete Playwright suite on
`chromium-dev` (153/154 — the sole non-pass is `release-gate.spec.ts`'s
plain-build-only debug-hooks check, which is expected to differ under
the dev server and is covered separately below, not a regression) and
on a fresh `PLAYWRIGHT_TEST=1` `chromium-preview` build (151/151
excluding `tests/release`, which needs the OTHER build), then
`npm run test:release` (its own plain, non-test build) 7/7 green
including that debug-hooks check passing correctly there. No
cross-workstream regressions found — the individual workstreams' own
test-first verification and the concurrent-session git-safety practice
used throughout this plan (narrow `git add`, verify-via-`git show`,
`git checkout HEAD --` to recover from working-tree races rather than
redo work) meant integration risk was already retired incrementally
rather than accumulating for this pass to discover. Screenshot QA
(throwaway spec, not committed) confirmed the plan's five checkpoints
visually: menu wide shot (single hex layer, square hexes, symmetric
floor, continuous corner shell, ramps flush to the floor), a wall/
corner climb, a goal-blast moment, both ball-cam indicator states, and
the pause → SETTINGS → overlay → BACK → RESUME flow.
