# Visual Language Deviations

Record deviations from `plan/psx_visual_stadium_game_loop_spec_v1_1_boost_pads.md`.

## Phase 13

- **This spec's own internal phase numbering (0-12, section 46) does not
  match the Master Build Brief's 18-phase numbering.** Master Brief Phase
  13 ("PSX renderer") maps to this spec's "Phase 6 — PSX render pass"
  (jitter, quantisation, Bayer dither, presets, accessibility reductions),
  plus the low-resolution-target/nearest-upscale/palette portion of its
  "Phase 5 — Base art language" (placeholder low-poly assets and lighting
  were already built in this project's own Phase 2; the starfield in this
  project's own Phase 2 as well). Full stadium art (ribs, glass panels,
  floor markings — this spec's Phase 7) is Master Brief Phase 14, not
  built here.
- **`VisualPreset` name collision, resolved by keeping two distinct
  types.** This project already had a `VisualPreset` type (asset pipeline
  spec, `"authentic"|"balanced"|"clean"` procedural-style knob) before
  this phase. This spec's section 39 `BrowserGameTestApi.setVisualPreset`
  takes a *different*, richer settings-object type also named
  `VisualPreset`. Rather than rename the pre-existing type (would ripple
  through every procedural asset factory), the richer settings type is
  named `PsxRenderSettings` here (`src/visual-language/PsxRenderSettings.ts`),
  keyed by the same three preset ids so selecting one selects the other.
- **`setVisualPreset(preset: VisualPreset)` takes the preset id string
  directly, not the spec's `DeepPartial<VisualPreset>` object-merge
  shape.** A partial-merge API implies a mutable "current settings" object
  callers can patch field-by-field; this project's three presets are
  fixed, fully-specified configurations (spec sections 7/9's own preset
  tables), and no UI or test currently needs anything finer-grained than
  "pick one of the three." Implementing deep-partial-merge semantics for
  a capability nothing yet exercises was judged premature — can be added
  if/when Phase 15 (settings UI) needs fine-grained overrides.
- **Vertex jitter "strength" (spec section 8's per-category table) is
  interpreted as inversely scaling the effective snap-grid resolution**
  (`effectiveResolution = baseGrid / strength`), not as a blend factor —
  the spec's own conceptual shader has no blend, only a hard snap.
  Strength 1.0 (arena metal) snaps to the literal base grid (240x135
  default); lower strengths snap to a proportionally finer grid, producing
  progressively subtler visible jitter, matching the spec's qualitative
  ordering ("ball jitter remains subtle", "thin gameplay lines use reduced
  jitter"). See `src/visual-language/VertexJitter.ts`'s own doc comment.
- **Vertex jitter is wired into car, ball, stadium floor/wall, and boost
  pad materials only** — not every material in the game (e.g. UI/HUD
  materials don't exist as `THREE.Material`s at all; the starfield
  deliberately has strength 0 so was left untouched entirely rather than
  wired with a no-op). Stadium ribs/glass panels/goal nets (Phase 14) will
  need their own jitter wiring (`glass`/`goalOutlines` categories already
  exist and are ready) once those materials exist.
- **Boost pad materials use the `goalOutlines` jitter category** (for the
  pad ring/glyph/energy-cluster meshes) and `arenaMetal` (for the base
  plate) — the spec's category table has no dedicated "boost pads" entry;
  `goalOutlines` ("thin gameplay lines use reduced jitter") was judged the
  closest semantic match for the pad's thin ring/glyph geometry.
- **Bayer dither's exact pipeline-stage ordering deviates textually from
  section 7's stage list** ("colour quantisation -> Bayer dithering ->
  contrast adjustment") but matches section 9's own code exactly (dither
  offset added, *then* quantisation floor — the only order that actually
  dithers anything, since quantising first would discretise away a
  subsequently-added sub-quantum dither offset). Contrast is applied
  before dither/quantisation in the implemented shader
  (`src/visual-language/PsxRenderPipeline.ts`), a defensible reading of
  "contrast adjustment" as a pre-quantisation tone step rather than a
  strict fourth pipeline stage — section 7's list is read as loosely
  enumerating pipeline *capabilities*, not a strictly-ordered spec.
- **No bloom/glow pass** (section 7's "optional low-resolution glow") —
  explicitly marked optional in the spec; a real bloom implementation
  needs additional render targets and blur passes, deferred to Phase 14
  alongside the rest of stadium VFX polish.
- **No accessibility-specific dither/jitter reduction preset or toggle**
  beyond the three built-in presets (the "clean" preset already disables
  jitter and uses the lightest dither, which doubles as a reasonable
  accessibility-leaning option) — a dedicated accessibility settings UI
  is Phase 15 ("UI and settings polish").
## Phase 14

- **Stadium field dimensions were NOT resized to this spec's 72x48/18-tall
  footprint** (section 12's `STADIUM_DIMENSIONS`). The current 40x60/20-
  tall footprint (`DEFAULT_STADIUM_DIMENSIONS` in `src/assets/AssetTypes.ts`)
  is a pre-existing, already-documented deviation from Phase 3 onward
  (`docs/physics-deviations.md` Phase 7 section: "resizing the field to
  72x48 now would be a recalibration exercise out of scope" — car speed
  curves, suspension, boost pad layout, camera clamping, and AI awareness
  radii across Phases 3-10 are all tuned against the current footprint).
  Phase 14's stadium art (floor markings, structural ribs) was scaled to
  fit the *existing* dimensions rather than the spec's literal numbers.
- **VFX is scoped to three effects with an unambiguous, physics-
  observation-only trigger** — boost trail (a car's `boostAmount`
  decreasing tick-over-tick), a ball-impact burst (the ball's velocity
  changing abruptly frame-to-frame), and a goal-celebration burst
  (entering the `GOAL_CELEBRATION` match state, team identified by which
  score increased). Car-car impact particles, jump bursts, and powerslide
  sparks (spec section 19) need either a dedicated collision-event
  channel or per-tick input-edge tracking neither of which exist yet
  without extending the physics/input module surface — deferred rather
  than approximated with a worse heuristic. The full goal-celebration
  choreography (shockwave, shards, arena pulse, star streak, banner,
  camera impulse — spec section 20) is reduced to a single team-coloured
  particle burst; the other five sub-effects are separate systems
  (shader-based arena pulse, a dedicated banner component, a camera
  controller hook) each substantial enough to warrant their own pass.
- **A single shared, fixed-size (500) particle pool rendered as one
  `THREE.Points` draw call**, not a separate system per effect type —
  satisfies spec section 18's "pooling" requirement directly. Uses a
  custom `THREE.ShaderMaterial` (not the built-in `THREE.PointsMaterial`,
  which only supports one uniform point size for an entire draw call, not
  a per-vertex size attribute) so each particle can shrink/fade over its
  own lifetime and an inactive pooled particle can be driven to
  `gl_PointSize = 0` (genuinely invisible) instead of rendering as a
  stray fixed-size dot sitting at the origin.
- **Floor markings (centre line, centre circle, goal-box outlines) and
  structural ribs were added to `StadiumGeometryFactory.ts`**; curved
  floor-to-wall/wall-to-ceiling transitions, the segmented transparent
  glass shell, and the floating mechanical base (spec section 13) were
  not — each is a substantially larger geometry-authoring task (curved
  transitions need new procedural geometry generation entirely; the
  glass shell needs the spec's 3-layer material system section 11
  describes) than the flat/thin marking geometry and instanced rib boxes
  built here.
- **Starfield goal response** (spec section 16: "radial star streak, team-
  colour pulse, brief exposure lift, return within 0.5 seconds") was not
  built — the existing 3-layer starfield from Phase 2 is unchanged. The
  new goal-celebration VFX burst (above) covers the moment visually; the
  starfield-specific response is deferred alongside the rest of the full
  goal-celebration choreography.
- New jitter categories were exercised on the new geometry: floor
  markings and boost pads share the `goalOutlines` category ("thin
  gameplay lines use reduced jitter" — an exact semantic match for floor
  markings, unlike boost pads' looser fit noted in Phase 13); structural
  ribs use `arenaMetal` (maximum jitter, matching the wall/floor/ceiling
  they extend).

## Phase 15

- **Settings-spec `VisualPreset` (section 39's rich per-field settings
  merge object) and this project's `PsxRenderSettings` remain distinct
  types** (see Phase 13 section above) — the new `setAccessibilityOverrides`
  method adds exactly two settings-spec-required accessibility toggles
  (reduced jitter, disable dithering) as first-class overrides applied on
  top of whichever preset is selected, rather than generalising to a full
  deep-partial-merge API. The other five accessibility toggles (reduced
  shake, reduced flashes, high-contrast ball, team-pattern mode, larger
  HUD) are persisted and shown in the UI but not yet wired to a live
  engine effect — see below.
- **Camera settings (FOV/distance/height/stiffness/ball-look strength/
  shake) and audio settings (master/music/effects/UI) are real, working
  UI controls with real persistence, but not yet live-applied** —
  `ChaseCameraController` reads its tuning from a module-level constants
  object (`CameraConstants.ts`), not a per-instance settings input, and
  the audio module is still `NullAudioModule` (Phase 16). Wiring these
  live is natural follow-up work once those modules accept runtime
  overrides, not a Phase 15 blocker — the settings themselves are
  correctly captured, validated, and persisted today.
- **Gameplay settings similarly split**: "default match length" is fully
  live (applied at boot and whenever changed, verified by a Playwright
  test that changing it in Settings changes Match Setup's selected
  duration) since `MatchFlowController.selectMatchDuration` already
  existed; "camera shake enabled" and "goal celebration intensity" are
  persisted UI-only for the same reason as the camera category above.
- **Controls category shows the default keyboard/mouse/gamepad bindings
  read-only** — spec section 25 explicitly permits deferring rebinding
  ("Rebinding may be deferred").
- **Colour quantisation is per-RGB-channel** (`floor(colour * levels +
  0.5) / levels` on the raw `vec3` colour), matching section 6's "32
  levels per RGB channel" default exactly — not a fixed indexed/LUT
  palette remap. `VISUAL_PALETTE` (section 6) is used for material/team
  colour *authoring* (car team colours now source from
  `VISUAL_PALETTE.playerCyan`/`opponentMagenta` instead of the ad hoc hex
  values Phase 9-11 picked before this palette existed), not as a runtime
  post-process LUT.

## Post-launch polish pass — WS5.A/B/C (arena shell, goals, fillets)

`plan/POLISH_OVERHAUL_PLAN.md` WS5: the previously-deferred "curved
corner/wall-ceiling transitions and segmented transparent glass shell"
(originally called out as out of scope in this doc's Phase 14 section)
are now implemented.

- **Hex shell texture built as a `DataTexture`, not `CanvasTexture`.**
  The plan's spec calls for `document.createElement("canvas")` +
  `CanvasTexture`. `StadiumGeometryFactory.createStadiumBlockout` (and
  therefore the new `HexPatternTexture.ts`) runs under both the browser
  and Vitest's DOM-less Node environment (`vitest.config.ts` sets
  `environment: "node"`) — `proceduralDeterminism.spec.ts` calls
  `createStadiumBlockout` directly. `document` doesn't exist there.
  Followed the same pattern already established by
  `TextureAssetLoader.ts`'s `createCheckerTexture`: a raw pixel buffer
  (`Uint8Array`) rasterised by a small software line-plotter (distance-
  to-segment thresholding, one thick line per hexagon edge) instead of
  the 2D canvas API, wrapped in a `THREE.DataTexture`. Fully
  deterministic, same visual result, works in both environments.
- **Goal box visuals mirror the physics goal-box colliders exactly** —
  same `fieldLength/2`, `goalWidth/2`, `goalHeight`, `goalDepth` — so the
  enclosed shell a scored ball visually disappears into matches where it
  physically stops. A thin emissive frame (`playerCyan`/
  `opponentMagenta`, per `VISUAL_PALETTE`) outlines each goal mouth.
- **Wall fillet visual orientation is a best-effort derivation, not a
  verified one** — the plan itself flags this ("Cylinder theta math is
  fiddly — after implementing, verify orientation with the Playwright
  screenshot... rather than by reasoning alone"). A screenshot pass
  (a `node` script driving a real Playwright/Chromium page) did confirm
  the arena renders without visible geometry errors and the goal frame
  outline is correctly positioned; the fillet strips themselves share
  the floor material at low contrast against the dark PSX background,
  so their exact curvature isn't independently screenshot-verifiable at
  this pass — the *physics* fillets (which drive actual gameplay) are
  separately and directly verified by `tests/unit/wallDriving.spec.ts`
  stepping real ticks and asserting the car's position/grounded state.
- **What initially looked like a rendering bug during the screenshot
  pass — a bright cyan hexagonal sphere near the car — turned out to be
  the ball** (`BallVisualFactory.ts`'s faceted `IcosahedronGeometry` body
  plus its cyan wireframe seam overlay), a pre-existing design unrelated
  to WS5.A's hex shell texture. Traced via `BallVisualFactory.ts`'s
  source before concluding it wasn't a regression.

## Post-launch polish pass — WS8 (graphics fixes)

- **WS8.A jitter removal**: `jitterEnabled` is now `false` in all three
  PSX presets (`authentic`, `balanced`, `clean`) — z-fighting from the
  vertex jitter shader was visible enough to be a net negative
  product-wide. The shader infrastructure (`VertexJitter.ts`, the
  per-category strength table) and the accessibility "reduced jitter"
  toggle are retained as-is (the toggle is now a no-op against a
  baseline that's already off, but still composes correctly —
  `base.jitterEnabled && !reducedJitter` stays `false` either way).
  `tests/visual-language/psx-pipeline.spec.ts`'s preset-switch test
  updated its `authentic`-preset assertion from `true` to `false`
  accordingly. Floor-marking z-fighting (a separate, narrower issue) was
  fixed independently: `MARKING_HEIGHT_OFFSET` raised 0.011 → 0.02, plus
  `depthWrite: false` + `polygonOffset` on the marking-line material as
  belt-and-braces.
- **WS8.B paneled floor**: the single tiled `ConcreteFloor-01_64`
  material on `FloorBase` is now a flat, unmapped dark base (used for
  the box's sides/underside only — its top face sits under the new
  panels) plus a separate `FloorPanels` group: a 4×6 grid of 10×10m
  `PlaneGeometry` tiles, each randomly assigned one of two plain
  concrete variants (`ConcreteFloor-01_64`/`-02_64`) and a random
  quarter-turn spin via `context.random` (deterministic, seeded — no
  `Math.random()`), with painted accent tiles
  (`ConcreteFloorPainted-C16x32B_64` blue / `…R_64` red) within 10m of
  the player/opponent goal lines respectively. `stadiumTextures.floor`
  is still loaded (unused by any mesh material now, same as
  `stadiumTextures.wall` has been since WS5.A) rather than removed —
  keeping it exercises the manifest-load/validation path the same way
  an actually-consumed texture would, and removing it wasn't asked for.
- **Panel in-place rotation needed `Object3D.rotateZ()`, not
  `mesh.rotation.z = …`.** The plan's suggested "rotate the plane mesh
  around Y by k·π/2" doesn't directly apply here: these panels are
  already flattened via `rotation.x = -Math.PI/2` (matching the existing
  floor-marking convention in this file) to lie flat with their normal
  pointing up, and setting `.rotation.z` as a second Euler component
  composes with that X rotation in world space rather than spinning the
  tile in its own surface plane. `rotateZ(angle)` (an `Object3D` method,
  not an Euler-component assignment) rotates around the object's own
  local Z axis — its normal, wherever it currently points in world
  space — which is exactly "spin the tile" regardless of the prior
  flattening rotation.

## Post-launch polish pass — R2 (hex shell emissive + rib tuning, plan/RAMPS_AND_FEATURES_PLAN.md)

- **Glass shell readability.** The hex-pattern glass material
  (`stadium-glass-shell-v1` → `v2`) was too dark to read against the PSX
  background. Added `emissive` + `emissiveMap` using the *same* hex
  texture as the diffuse `map` — since the texture's background is
  transparent black, only the hex line pixels contribute any emissive
  glow, so the shell stays "faint and transparent" everywhere except the
  lines themselves, which now clearly read. Opacity nudged 0.16 → 0.28
  (still clearly see-through). Covered by
  `tests/unit/stadiumVisuals.spec.ts`, which asserts `emissiveMap ===
  map` (proving the "same texture" design) and an opacity band.
- **Rib readability + spacing.** `stadium-rib-v1` → `v2`: width 0.4 →
  0.22 (skinnier), depth 0.5 → 0.4, spacing 4 → 6 (more spaced out,
  `ribCount` drops from 12 to 8 per side within R1's corner-clamped run
  length of 48m), colour lightened from near-black `0x0c0e15` to
  `0x39414f` with an `emissive`/`emissiveIntensity` tint. The unit test's
  "not near-black" assertion accounts for three.js storing
  `MeshStandardMaterial.color` in **linear** space when colour management
  is enabled — the naive sRGB-space sum of a mid-grey hex like `0x39414f`
  is misleadingly high once gamma-converted to linear, so the threshold
  is tuned well below that but still comfortably above the old
  near-black colour's much smaller linear sum.

## Post-launch polish pass — R4 (graphics defaults/resolutions, plan/RAMPS_AND_FEATURES_PLAN.md)

- **Internal resolutions raised across all three PSX presets**
  (`PsxRenderSettings.ts`): authentic 320×180 → 480×270, balanced
  426×240 → 640×360, clean 640×360 → 960×540. `jitterGrid` values are
  left unchanged (jitter itself stays disabled product-wide per the
  WS8.A z-fighting deviation above; the grid constants only matter if
  it's re-enabled via the accessibility toggle path).
- **Default preset changed `"balanced"` → `"clean"`** everywhere a
  default is read: `settingsStore.DEFAULT_SETTINGS.graphics.preset`,
  `PlaceholderSceneRenderer`'s `visualPreset`/`effectiveSettings` field
  initialisers, `AssetPipeline.initialise`'s procedural context (both
  the main pipeline context and the car-preview context), and
  `GameRuntime.getVisualPreset()`/`getVisualDiagnostics()`'s fallback
  values used before the real scene renderer exists. Fresh installs (no
  `localStorage` settings yet) now render at the higher-fidelity 960×540
  clean preset by default instead of balanced.
- **Density defaults raised to "max settings" defaults**:
  `DEFAULT_SETTINGS.graphics.particleDensity`/`starDensity`: `"normal"` →
  `"high"` (`glowEnabled` was already `true`, `fullscreen` stays `false`
  — a fullscreen default would be surprising/disruptive on load, unlike
  a visual-fidelity knob).

## Post-launch polish pass — F3 (single-layer square hex shell, plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md)

- **Root cause 1: double hex layer.** Every glass-shell surface
  (`SideWallLeft`/`Right`, `Ceiling`, end-wall side segments + lintel,
  goal-box back/sides/roof, `CornerWallPanel`s) was a 1m-thick
  `BoxGeometry` using the shared transparent `DoubleSide` glass material
  with `depthWrite: false`. A transparent double-sided box renders its
  hex pattern on **both** parallel faces — so every wall and the roof
  visibly showed two hex layers roughly a metre apart. Fixed by
  converting every one of those surfaces from a box to a single-sided
  `PlaneGeometry` positioned exactly on the collider's inner (field-
  facing) face — `createShellPlaneGeometry()` in
  `StadiumGeometryFactory.ts` builds and registry-caches these planes.
  The material itself keeps `side: THREE.DoubleSide` (bumped to registry
  key `stadium-glass-shell-v3`) so the single plane still reads correctly
  from both interior and exterior camera angles — only the geometry
  changed from two parallel faces to one.
- **Root cause 2: stretched, inconsistent hexes.** One glass material
  with `hexTexture.repeat.set(10, 10)` was shared by every surface
  regardless of its own world-space dimensions: side walls (48×20 world
  units) got hex cells stretched 2.4:1, the ceiling (42×60) a different
  4.2:1-ish stretch, and the corner panels (≈1.67×20, since a single
  panel's chord is barely 2m wide but the wall is 20m tall) were
  stretched roughly **12:1** — this is exactly why the corners visually
  "looked different" from the straight walls. Fixed by moving hex
  density off the material's shared `repeat` (now identity `(1, 1)` —
  see the material's own comment for why it stays on the material, not
  the geometry, for `DoubleSide` sake) and onto each plane's own UVs:
  `createShellPlaneGeometry(registry, key, worldW, worldH)` builds a
  `PlaneGeometry(worldW, worldH)` and rescales its UV attribute by
  `worldW / HEX_TILE_WORLD_SIZE` and `worldH / HEX_TILE_WORLD_SIZE`
  (`HEX_TILE_WORLD_SIZE = 11.5` world units per full texture tile, ≈1.92m
  hexes) — so every surface, corner panels included, reads the same
  real-world hex size and stays square regardless of its own aspect
  ratio.
- **Root cause 3: non-periodic tile + thin lines.**
  `HexPatternTexture.ts` used `HEX_CIRCUMRADIUS = 48` px on a 512px tile
  with `colStep = 72` (`hexWidth * 0.75`) — 72 does not divide 512, so
  the pattern drifted out of phase across a `RepeatWrapping` tile
  boundary, adding faint seam lines. `LINE_WIDTH = 2.5` also read as
  thin. Reworked around four related constants: `COL_STEP = 64` (8
  columns; horizontal *period* is `2 * COL_STEP = 128`, which divides
  512 exactly — the alternating even/odd column vertical offset means
  the true repeat unit is two columns, not one), `HEX_CIRCUMRADIUS =
  COL_STEP / 1.5 ≈ 42.667` (flat-top geometry keeps `colStep = 1.5R`),
  `ROW_STEP = TEXTURE_SIZE / 7 ≈ 73.14` (vs the ideal `√3·R ≈ 73.9` — an
  ~1% vertical squash, invisible in practice, in exchange for `7 *
  ROW_STEP` landing exactly on the tile height), and `LINE_WIDTH = 4.0`.
  `drawHexGrid` now iterates exact integer column/row indices scaled by
  these constants (`cx = col * COL_STEP`, `cy = row * ROW_STEP`) instead
  of accumulating `cx += colStep` in a float loop and deriving row
  spacing from `√3·R` — every hex centre lands on an exact multiple of
  the periodic step, so the pattern tiles seamlessly. Still a raw
  `DataTexture` (not `CanvasTexture`), since this factory has to keep
  working under Vitest's DOM-less Node environment.
- **Positioning math, one surface at a time**: every plane replaces a box
  whose thickness ran along a known local axis, so the "inner face"
  offset is always half that box's thickness in the field-facing
  direction — side walls/ceiling/end walls/goal-box faces all move from
  the old box-centre position to `centre ∓ WALL_THICKNESS / 2`,
  reasoned out per-surface directly in `StadiumGeometryFactory.ts`'s
  inline comments. `CornerWallPanel`s are the one non-trivial case: each
  panel's `spec.rotation` (from `ArenaRampGeometry.ts`'s
  `generateCorner`, unchanged by F1/F2) maps the panel's local +Z axis to
  the OUTWARD normal, so the inner (drivable/visible) face sits at
  `spec.translation + rotate(spec.rotation, {0, 0, -CORNER_PANEL_HALF_THICK})`
  — the box's *centre*, offset inward along its own rotated local Z, not
  a world-axis offset. This keeps "what you see is what you drive on"
  intact: the glass plane lands exactly on the F2-fixed inner face the
  physics collider actually presents, not the box centre.
- **What the tests prove** (`tests/unit/stadiumVisuals.spec.ts`): a
  single-layer invariant (every named glass-shell mesh's
  `geometry.type === "PlaneGeometry"`, never `"BoxGeometry"`) covering
  side walls, ceiling, all 24 corner panels, and every glass child of the
  end-wall/goal-box groups (found by material identity, not just name,
  so nothing is missed); a square-hex invariant computing each plane's
  UV span against its `geometry.parameters.width/height` and asserting
  `worldW / uvSpanU` and `worldH / uvSpanV` both equal
  `HEX_TILE_WORLD_SIZE` within 1% (this is the test that would have
  failed pre-F3, since the corner panels were ~12:1 off); and texture
  constants (`LINE_WIDTH >= 4`, `TEXTURE_SIZE % (2 * COL_STEP) === 0`).
  `tests/unit/arenaRampGeometry.spec.ts`'s visual/physics bijection test
  was updated so its `CornerWallPanel` branch reconstructs the same
  inner-face offset `StadiumGeometryFactory.ts` computes (rather than
  expecting the mesh at the spec's raw `translation`), preserving the
  test's actual guarantee — visual surface exactly matches physics
  surface — instead of weakening it.

## F7 — Symmetrical floor texture pattern (plan/ARENA_FLUSH_AND_REFINEMENTS_PLAN.md)

`createPaneledFloor` picked each panel's texture and quarter-turn via
`context.random`, so the floor's alternating look was pure noise with
no symmetry. Replaced both random draws with a deterministic function
of `(mc, mr)` — each panel's distance to the *nearer* edge on its own
axis (`mc = min(column, COLUMNS-1-column)`, `mr = min(row, ROWS-1-row)`)
— so a panel and its mirror image across either field axis always
share the same `(mc, mr)` pair and therefore the same material
(`(mc*2+mr) % panelMaterials.length`) and rotation
(`(π/2) * ((mc+mr) % 4)`). The existing goal-line accent overrides
(painted player/opponent panels near each goal) are untouched and
already column-symmetric by construction (they depend only on `z`);
they're intentionally *not* row-symmetric, since the two ends are
different teams' colours by design.

Removing the two `context.random` draws per panel shifts the seeded
random stream consumed by steps that run after `createPaneledFloor` —
checked for fallout across the full `vitest run` suite (324/324 green)
and the seeded preview-determinism Playwright test (still compares two
identically-seeded runs against each other, so it's insensitive to
where in the stream they diverge).

**What the tests prove** (`tests/unit/floorPanels.spec.ts`, new): every
panel's material and rotation matches its mirror across the column
axis; the same across the row axis for panels outside the goal-line
accent zones; and two independent builds fed the same input textures
(simulating two separate game sessions) produce identical material/
rotation choices per grid position — confirming the pattern is a pure
function of position, not session-to-session noise. Confirmed via
git-stash that 2 of the 3 tests fail on the pre-fix random code. The
existing `tests/visual-language/arena-shell.spec.ts` "paneled floor"
Playwright gate stays green (panel count/opacity unaffected by which
material each panel picks).
