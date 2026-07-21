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

- **Colour quantisation is per-RGB-channel** (`floor(colour * levels +
  0.5) / levels` on the raw `vec3` colour), matching section 6's "32
  levels per RGB channel" default exactly — not a fixed indexed/LUT
  palette remap. `VISUAL_PALETTE` (section 6) is used for material/team
  colour *authoring* (car team colours now source from
  `VISUAL_PALETTE.playerCyan`/`opponentMagenta` instead of the ad hoc hex
  values Phase 9-11 picked before this palette existed), not as a runtime
  post-process LUT.
