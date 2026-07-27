# Game Enhancements Plan (G-series): world, physics feel, UI polish

Executor notes: this plan is written to be run workstream-by-workstream by a
Claude Sonnet session. Every root cause below was verified against the actual
code by the planning session — do not re-litigate the diagnoses; implement,
run the gate, commit, push, move on. Branch: `claude/online-multiplayer`
(the same branch every prior series shipped on).

## Ground rules (apply to every workstream)

1. After each workstream: `npx vue-tsc --noEmit` clean → new gate tests pass →
   FULL `npx vitest run` green (473+ tests; fix forward, never disable) →
   `npm run validate` → commit with a descriptive message → push
   (`git push -u origin claude/online-multiplayer`).
2. **Any workstream that changes simulation physics (G5, G6, G7 — anything
   under `src/physics/`) WILL break `tests/unit/simDeterminism.spec.ts`'s
   pinned `GOLDEN_HASH`.** That is expected and the documented procedure is:
   run the suite, take the new hash the test failure reports, update
   `GOLDEN_HASH` in `simDeterminism.spec.ts` AND `MP_BUILD_HASH` in
   `src/stores/onlineStore.ts` to the same value, in the same commit. Never
   update one without the other (mismatched online builds must refuse to
   match). Visual/UI workstreams (G1-G4, G8-G10) must NOT change the hash —
   if they do, you've touched the sim by accident; stop and fix.
3. Performance budget for the world additions (G1/G2): at most 2 extra draw
   calls total (one moon mesh, one asteroid `InstancedMesh`), no per-frame
   per-asteroid JS work, no new textures above 1024x512. The PSX look is
   low-res anyway — never add high-poly geometry (moon sphere ≤ 24x16
   segments, asteroid template ≤ 42 verts).
4. Procedural determinism: anything randomized must draw from the existing
   `ProceduralAssetContext.random` (`SeededRandom`) so two clients render the
   same world. `tests/unit/proceduralDeterminism.spec.ts` shows the pattern.
5. Match surrounding comment style/density. Pure logic in testable modules,
   thin adapters at the edges.

## Verified architecture facts (planning session confirmed all of these)

- Space bg: `src/assets/procedural/StarfieldFactory.ts`, added to the world in
  `AssetPipeline.buildPlaceholderWorld()` (root.add(createDefaultStarfield(...)))
  and in the `buildCustomisePreviewScene` path (~line 343). Camera far plane is
  500 (`PlaceholderSceneRenderer.ts:64`); starfield spans radius 80-340.
- Hex texture: `src/assets/procedural/HexPatternTexture.ts` builds a seamless
  512px `DataTexture` (RepeatWrapping, periodicity unit-tested). Shell planes
  get per-plane UVs via `createShellPlaneGeometry` in
  `src/assets/procedural/StadiumGeometryFactory.ts` (`HEX_TILE_WORLD_SIZE=11.5`).
- **Hex clipping root cause (G3)**: all 24 curved corner panels share ONE
  geometry (key `stadium-corner-panel-plane-v3-...` — same halfExtents for
  every panel) whose UVs start at u=0. So the pattern restarts at every panel
  boundary along the corner arc — partial hexes get chopped at each edge.
  The straight walls don't show it because each is one continuous plane.
- Arena physics: `src/physics/arena/TestArenaPresets.ts` (+
  `ArenaRampGeometry.ts` shared by visuals). `TEST_ARENA_DIMENSIONS` =
  halfWidth 20, halfLength 30, height 20; goal = `GOAL_HALF_WIDTH 7`,
  `GOAL_HEIGHT 6`, `GOAL_DEPTH 5`. Visual dims match physics dims exactly
  (`DEFAULT_STADIUM_DIMENSIONS` derives from the same constants).
- **Invisible-wall root causes (G5)** in `buildGoalEnd` (TestArenaPresets.ts):
  1. `POST_OVERLAP = 0.25`: each goal-post wall segment is widened by 0.25 AND
     shifted 0.25 toward the centreline → its inner edge lands at
     `GOAL_HALF_WIDTH - 0.5` = x±6.5, i.e. an invisible 0.5 m lip protruding
     into each side of the goal mouth (visible frame is at x±7).
  2. `SEAM_OVERLAP = 0.5`: `boxSideZCentre = zSign*(halfLength + GOAL_DEPTH/2
     - SEAM_OVERLAP)` shifts the goal-box side walls AND roof 1 m INTO the
     field: they span z∈[29,35] while the end-wall inner plane is z=30. The
     roof piece (y∈[6,7], x∈[-7,7], z∈[29,30]) is the "invisible wall above
     the goal"; the side pieces (x∈[7,8] and x∈[-8,-7], z∈[29,30]) are the
     lips beside the mouth.
- Ramps: `generateArenaRamps` builds per-wall quarter-round fillet runs from
  5 rotated boxes each. End-wall runs span x from `goalHalfWidth` to
  `halfWidth - CORNER_RADIUS` — the run's goal-side END is an open
  cross-section (you see under the arc = G7's "cuts off" report). Visual ramp
  boxes reuse the floor texture with BoxGeometry's default 0..1 UVs per face →
  stretched differently on every box (G7's "stretched" report).
- Car/ball: `RL_CONSTANTS` carMass 180 / ballMass 30 (real RL ratio). Custom
  one-way extra impulse ball-ward in `src/physics/collision/CarBallCollision.ts`;
  the BALL→CAR push is whatever Rapier's solver does with the 6:1 mass ratio.
- Flip: `src/physics/car/DodgeController.ts` sets a CONSTANT angvel
  `2π/activeDuration` (≈9.67 rad/s) for the whole 0.65 s, then hard-snaps
  angvel to its yaw component. `parameters.dodge` lives in
  `src/physics/PhysicsParameters.ts` (activeDuration 0.65, recovery 0.15).
- Settings jump root cause (G9): `SettingsPanel.vue`'s `.menu-panel` has
  `justify-content: center` — the whole column re-centres vertically as each
  tab's content height differs, so the heading/tabs move.
- Menu remnants root cause (G10): nothing resets the physics world on
  returning to the menu. `MatchFlowController.returnToMenu()` only resets
  score/state. The live physics ball IS the menu ball (R8) and the live cars
  stay wherever the last match left them, under the static MenuGhost cars.
  `physics.resetWorld({ carCreationOrder, kickoffVariantIndex })` already
  exists (see `beginKickoffReset`).
- Moon asset: **already committed** at `public/assets/space/moon_1k.jpg`
  (NASA CGI Moon Kit LROC color map, 1024x512, public domain — see
  ATTRIBUTION.md next to it). Do NOT download anything; no network needed.
  Note the texture-manifest generator only scans `public/assets/textures/`
  for PNGs — the moon deliberately lives outside it and is loaded directly.

---

## G1: Moon in the space background

**Files**: new `src/assets/procedural/SpaceBackdropFactory.ts`;
`src/assets/AssetPipeline.ts` (add to `buildPlaceholderWorld` next to
`createDefaultStarfield`).

- `createMoon(context, texture: THREE.Texture | null): THREE.Mesh` — a
  `SphereGeometry(radius 26, 20, 14)` (registry key `space-moon-v1`), material
  `MeshBasicMaterial` (unlit — reads perfectly against the PSX void, no
  lighting cost) with `map: texture` when given, else flat `0xb8bcc8`.
  Position it high and off-axis so it reads over the arena's open end but
  never behind gameplay UI: `(120, 95, -210)` (inside the far plane 500;
  outside the starfield's near layer). `magFilter = NearestFilter` on the
  texture for the PSX crunch, `colorSpace = SRGBColorSpace`.
- Texture loading: in `AssetPipeline` (which already owns async texture
  loading), load `/assets/space/moon_1k.jpg` with `THREE.TextureLoader`
  wrapped in try/catch → pass `null` on failure (tests run in Node with no
  loader — the factory must accept null and never touch `document`).
- The factory itself must be constructible in Node (no DOM): geometry+material
  only, texture injected from outside. Follow `HexPatternTexture`'s reasoning
  comment.

**Gate G1** — new `tests/unit/spaceBackdrop.spec.ts`:
- `createMoon(context, null)` returns a mesh named `"Moon"`, vertex count ≤
  500, position.length() < 500 (inside the far plane), and does not throw
  without a DOM.
- Geometry is registry-cached: two calls share the same geometry instance.
- `buildPlaceholderWorld` scene graph contains exactly one object named
  `"Moon"` (extend `tests/unit/stadiumVisuals.spec.ts` if it already walks
  the placeholder world — follow its existing pattern).

## G2: Low-poly floating asteroids

**Files**: `SpaceBackdropFactory.ts` (same new module as G1);
`AssetPipeline.buildPlaceholderWorld`.

- `createAsteroidField(context): THREE.InstancedMesh` — ONE
  `IcosahedronGeometry(1, 0)` template (12 verts, registry key
  `space-asteroid-v1`), deformed once at build time: displace each vertex
  radially by `context.random.range(0.72, 1.28)` (deterministic lumpy rock;
  merge-by-position first so shared corners displace together — or accept the
  faceted split-vertex look, which is fine for PSX). Material:
  `MeshStandardMaterial` flat gray `0x6a7080`, `flatShading: true`.
- ~14 instances. Per instance draw from `context.random`: radius 150-300,
  full-sphere direction but clamp |y| component ≥ 0.15·radius away from the
  horizon line so none sits behind the arena floor line; scale 2-7 (non
  uniform per axis ±30%); random orientation. Write matrices once —
  **no per-frame updates** (static field; the PSX look doesn't need drift,
  and rule 3 forbids per-asteroid frame work).
- Name it `"AsteroidField"`, add beside the starfield in
  `buildPlaceholderWorld`.

**Gate G2** — extend `tests/unit/spaceBackdrop.spec.ts`:
- Returns an `InstancedMesh` with `count` ≥ 10 and ≤ 20, template geometry
  vertex count ≤ 42 (rule 3).
- Deterministic: two factories built from two contexts with the same seed
  produce byte-identical `instanceMatrix.array`.
- Every instance's translation has length between 140 and 320, and
  `|y| ≥ 0.15 * length * 0.9` (allow slack for the scale part of the matrix —
  extract translation only).

## G3: Continuous hex pattern on the corner panels

**Files**: `src/assets/procedural/StadiumGeometryFactory.ts`
(`createArenaRamps`'s `corner-wall` branch).

- Give each of the 6 panels in a corner its own geometry with a U OFFSET so
  the pattern continues across the arc: panel `i` (0..5, in arc order) gets
  UVs `u ∈ [i·w, (i+1)·w] / HEX_TILE_WORLD_SIZE` where `w = 2·chordHalf`
  (panel world width). Registry key must include the index:
  `stadium-corner-panel-plane-v4-${i}-${...extents}` — 6 geometries total,
  shared across all 4 corners (each corner runs the same 0..5 sequence, and
  `RepeatWrapping` is already set on the hex texture so u > 1 is fine).
- Implementation: add an optional `uOffsetWorld` parameter to
  `createShellPlaneGeometry` (default 0, added to the scaled U) rather than a
  new helper — every other caller keeps offset 0.
- Panels within one corner traverse the arc in a consistent direction; check
  the winding so the offset ADVANCES with alpha (if the seam looks worse
  reversed, flip to `(5 - i)` — verify with the two-browser/live check or a
  screenshot via the run skill, not by guessing).
- This makes hexes continuous corner-internally. The corner→straight-wall
  junction will still have a pattern jump — acceptable; the report was about
  the corners' internal clipping ("textures in the corners ... not
  continuous and get clipped").

**Gate G3** — extend `tests/unit/stadiumVisuals.spec.ts` (or new
`cornerHexContinuity.spec.ts`): build the stadium group, collect the 24
`CornerWallPanel` meshes, group by corner (nearest arc centre), and assert
within each corner the 6 panels use 6 DISTINCT geometries whose max-U values
form an arithmetic progression with step `2·chordHalf/HEX_TILE_WORLD_SIZE`
(read `geometry.attributes.uv` directly). Also assert adjacent panels'
shared-edge U values match (end of panel i == start of panel i+1).

## G4: World colour pass

The current world reads desolate because everything sits in the same
narrow blue-gray band (floor base `0x11131a`, ribs `0x39414f`, void
`#05060B`) with only the shell's cyan glow as relief. Apply this curated
pass — it keeps the PSX space-noir identity but adds warmth and depth
(three temperature layers: warm floor, neutral structure, cool glow):

**File**: `src/visual-language/PsxVisualPalette.ts` + the materials in
`StadiumGeometryFactory.ts` that hard-code hex values.

1. Add to `VISUAL_PALETTE`: `duskViolet: "#141126"` (space depth),
   `warmConcrete: "#2E2A26"` (floor warmth), `hazardAmberDim: "#6E5A2A"`,
   `horizonTeal: "#0F2E33"`.
2. `PlaceholderSceneRenderer.ts:50` `setClearColor(0x05010a, 1)` →
   `0x141126` (`duskViolet`) — lifts the sky off pure black so the
   moon/asteroids/starfield have depth separation.
3. Floor base material `0x11131a` → `0x1d1b22` (slight warm lift; the
   textured panels sit on top, this is what shows between/under them).
4. Ribs `0x39414f` color → keep, but emissive `0x18222e` → `0x2a2118`
   (warm amber-ish uplight instead of more blue) — structure reads as lit
   by the arena rather than more cold void.
5. Ramp fallback color `0x8a929e` → `0x7d776e` (match the warmer floor).
6. Glass shell: keep the cyan identity but drop `emissiveIntensity`
   0.85 → 0.7 and opacity 0.28 → 0.24 — with a violet sky it no longer
   needs to carry the whole scene.
7. Do NOT touch team colors (`playerCyan`/`opponentMagenta`) or UI colors.

**Gate G4** — new `tests/unit/worldPalette.spec.ts`: assert the new palette
keys exist and parse as valid `#rrggbb`; assert `VISUAL_PALETTE.playerCyan`
=== "#24E6FF" and `opponentMagenta` === "#FF3AAE" (frozen); build the
stadium group and assert the floor-base material color equals the new value
and the rib material's emissive equals the new warm value (read
`material.color.getHexString()`). This gate exists to prove the pass was
actually applied, and pins team colors against accidental drift.

## G5: Remove the invisible walls around the goal mouth

**File**: `src/physics/arena/TestArenaPresets.ts` (`buildGoalEnd`). Physics
change → ground rule 2 (hash bump).

1. Posts: keep the widened half-extent but shift the centre OUTWARD so the
   inner edge lands exactly on the goal mouth:
   `translation.x = ±(sidePostCentre + POST_OVERLAP)` (was `∓POST_OVERLAP`
   inward). Inner edge = `GOAL_HALF_WIDTH` exactly; the extra width overlaps
   the corner side harmlessly.
2. Goal-box side walls + roof: keep the seam overlap but only BEHIND the end
   wall's inner plane (z ≥ halfLength):
   `boxSideZHalfExtent = GOAL_DEPTH / 2 + SEAM_OVERLAP / 2`,
   `boxSideZCentre = zSign * (halfLength + GOAL_DEPTH / 2 + SEAM_OVERLAP / 2)`
   → spans z ∈ [halfLength, halfLength + GOAL_DEPTH + SEAM_OVERLAP]: still
   overlaps the end wall's thickness (z 30..31) at the join AND the back wall,
   but nothing pokes into the field.
3. Leave the header (above the goal, z 30..31) alone — a wall exists there
   visually (the lintel) and should exist physically.

**Gate G5** — new `tests/unit/goalMouthClearance.spec.ts`: pure test over
`getArenaPresetDefinition("box-arena").colliders`. Define the open goal-mouth
volume `x ∈ (-GOAL_HALF_WIDTH, GOAL_HALF_WIDTH)`, `y ∈ (0.05, GOAL_HEIGHT -
0.05)`, `z ∈ (halfLength - 2.6, halfLength)` (and mirrored) — 2.6 stays clear
of the end-wall fillet arc (radius 2.0) plus margin... actually the fillet
runs stop AT x=±goalHalfWidth so they never enter |x| < 7; still, skip
`rotation`-carrying colliders (the fillets) by checking `spec.rotation ===
undefined`, and for every axis-aligned collider assert its AABB does not
intersect the volume. Also assert the goal INTERIOR (x ∈ ±(7-0.1), y 0..6,
z halfLength..halfLength+GOAL_DEPTH) is not blocked: the ball must reach the
sensor — reuse/extend `tests/unit/goalIntegrity.spec.ts`'s style: spawn the
ball just outside the mouth at (±6.2, 1, halfLength-1.5) moving straight in
(0, 0, ±20) and assert a goal event fires within 120 ticks (this exact shot
currently clips the 6.5 lip — it must score after the fix). Then hash bump
per rule 2.

## G6: Ball pushes the car around a bit less

Real Rocket League's ball barely moves a car on contact (mass ratio 180:30
plus Bullet solver differences); ours uses the same ratio but Rapier resolves
contacts with full restitution/impulse symmetry, so the ball visibly shoves
the car. Rather than guessing solver internals, damp the ball→car transfer
directly and tunably:

**Files**: `src/physics/PhysicsParameters.ts` (+`carBall.ballPushbackScale:
number` — default `0.55`), `src/physics/collision/CarBallCollision.ts`,
called from wherever `resolveCarBallContacts` is invoked in
`PhysicsFacade.step` (verify call order: it runs post-step).

- In `resolveCarBallContacts`, snapshot each car's linvel/angvel at the TOP
  (before any custom impulse) is not enough — the Rapier step already ran.
  Instead: `PhysicsFacade.step()` must capture `preStepVel[carId]`
  (linvel+angvel) immediately BEFORE `world.step()`, and pass it in. On a
  tick where a car-ball contact manifold exists (`touchingNow`, not just
  onset), blend that car's post-step velocity back toward its pre-step
  velocity by `(1 - ballPushbackScale)` of the DELTA:
  `newVel = preVel + ballPushbackScale * (postVel - preVel)` for both linear
  and angular — but ONLY when the car is NOT also contacting the world
  (otherwise this would soften wall/floor bounces; check via the existing
  grounded flag: skip the blend when `car.runtime.grounded` is false AND a
  wall contact exists is over-engineering — simply apply the blend always on
  ball-contact ticks; gravity/drive deltas are tiny within one 1/120 s tick
  and are inside `preVel→postVel` anyway, scaled equally. Accept that).
- 0.55 keeps some physicality (a hard ball hit still nudges you) while
  cutting the shove roughly in half. Expose it as a parameter so feel can be
  tuned in one place.

**Gate G6** — new `tests/unit/ballCarPushback.spec.ts` (PhysicsFacade
integration, style of `tests/unit/dodgeFlip.spec.ts`): fire the ball at a
stationary grounded car at 30 m/s; record the car's speed 10 ticks after
contact with `ballPushbackScale: 1.0` (parameter override — check how tests
inject parameters; `PhysicsFacade` takes parameters in its constructor/init)
vs default `0.55`. Assert (a) default-car speed < 60% of scale-1.0 car speed,
(b) ball's outgoing speed is within 10% between the two runs (we damp the
car's kick, not the ball's bounce), (c) with `ballPushbackScale: 1.0` the sim
hash equals... no — simpler: (c) a run with the parameter at 1.0 must NOT be
asserted against the golden hash; the DEFAULT changes the hash, bump per
rule 2.

## G7: Flip feel (research-informed) + ramp texture/goal-edge cleanup

### G7.a Flip feel

What makes the real RL dodge feel clean (sourced from the RLBot community's
reverse-engineering of RL's dodge, and consistent with our spec section 25):
1. The flip rate is FRONT-LOADED: angular velocity jumps immediately to its
   peak and carries, rather than a constant metronome rate for 0.65 s.
2. The END of the flip is damped, not chopped: from ~0.35 s the pitch
   angular velocity is strongly damped, so the car eases into wheels-down
   instead of snapping (our current `setAngvel(yawOnly)` at exactly 0.65 s is
   the "missing smoothness" the user feels).
3. Flip cancels stay responsive because the cancel acts on that same damped
   tail (ours already blends — keep it).

Implementation — **new pure module `src/physics/car/DodgeRateProfile.ts`**:
- `flipRate(elapsed: number, activeDuration: number): number` returning the
  rad/s rate at time `elapsed`, piecewise: full rate `R1` for the first 55%
  of the duration, then linear ramp down to `0.25·R1` at 100%. Choose `R1`
  such that the integral over [0, activeDuration] is EXACTLY `2π` (solve
  analytically: `∫ = R1·0.55·T + ((1+0.25)/2)·R1·0.45·T = R1·T·(0.55 +
  0.28125) = R1·T·0.83125` → `R1 = 2π / (0.83125·T)` ≈ 11.63 rad/s for
  T=0.65). Front-loaded AND lands wheels-down by construction.
- `DodgeController.updateDodgeState` uses
  `flipRate(car.runtime.dodgeElapsed, activeDuration) * (1 - cancelBlend)`
  instead of the constant, and on completion REPLACES the hard yaw-snap with
  a 3-tick exponential damp of the non-yaw angvel (factor 0.4/tick, then
  zero) — move that into the recovery phase's first ticks.
- Keep `activeDuration` 0.65 and all trigger logic unchanged.

### G7.b Ramp texture scale + goal-edge cap

**File**: `StadiumGeometryFactory.ts` `createArenaRamps`.
- Stretch fix: replace the plain `BoxGeometry` for `RampSegment` with a UV-
  rescaled clone (same approach as `createShellPlaneGeometry`): scale each
  face's UVs by (faceWorldWidth / RAMP_TEX_WORLD_SIZE, faceWorldHeight /
  RAMP_TEX_WORLD_SIZE) with `RAMP_TEX_WORLD_SIZE = 4` (the floor texture
  tiles at ~4 m). BoxGeometry groups its UVs per face in a fixed order
  (+x,-x,+y,-y,+z,-z, 4 uvs each) — write a small helper
  `scaleBoxUvs(geometry, halfExtents, worldPerTile)` in the same file. Ensure
  the ramp textures have `wrapS/wrapT = RepeatWrapping` (the floorPanelSet
  loader already sets it for panels — the ramp reuses `floorPanelSet[0]`, so
  it's already repeat-wrapped; verify).
- Goal-edge cap: for the four END-WALL fillet runs, add a visual-only cap at
  the goal-side end (x = ±GOAL_HALF_WIDTH plane): a quarter-disc
  `THREE.ShapeGeometry` (arc radius `RAMP_FILLET_RADIUS`, matching the
  fillet's cross-section: the region between floor, wall and the arc),
  positioned/rotated to sit flush on that plane facing the goal mouth, using
  the same `rampMaterial`. Registry key `stadium-ramp-endcap-v1`; 4 caps
  (2 ends × 2 sides), named `"RampEndCap"`. This closes the "see under the
  ramp" hole and visually meets the goal frame post at x=±7.

**Gate G7** — new `tests/unit/dodgeRateProfile.spec.ts`:
- Numerically integrate `flipRate` over [0, T] at 1/120 steps → `2π ± 1%`.
- `flipRate(0) > flipRate(T·0.99)` (front-loaded), rate at 100% ≈ 0.25·peak.
- Monotonic non-increasing.
Extend `tests/unit/dodgeFlip.spec.ts`: after a full forward dodge +
recovery, the car's pitch/roll angvel magnitude < 0.1 rad/s and total pitch
rotation ≈ 360° (existing test probably asserts this — keep it green).
Extend `tests/unit/stadiumVisuals.spec.ts`: stadium group contains exactly 4
`RampEndCap` meshes; every `RampSegment`'s uv max on each face ≠ 1 exactly
(i.e., rescaled) — simpler: assert at least one RampSegment geometry has a
uv coordinate > 1.5 (proves world-scaled tiling on a long run). Hash bump
per rule 2 (G7.a only; G7.b must not affect the hash).

## G8: (reserved — merged into G4; no separate workstream)

## G9: Settings menu — anchor title + tabs

**File**: `src/components/menu/SettingsPanel.vue` (scoped styles only).
- `.menu-panel`: `justify-content: center` → `flex-start`, add
  `padding-top: 10vh`.
- `.category-content`: add `min-height: 24rem` (taller than the tallest tab
  today) so the BACK button below doesn't jump between tabs either; keep
  `max-width` as is. Check each tab renders inside 24rem at default zoom —
  if CONTROLS (the longest) exceeds it, raise to fit the longest tab.

**Gate G9** — new `tests/unit/settingsLayout.spec.ts`: parse the SFC source
(read the file as text — no DOM needed, matching how other tests assert on
Vue sources if any do; otherwise a plain readFileSync + regex) and assert the
`.menu-panel` block contains `justify-content: flex-start` and does NOT
contain `justify-content: center`, and `.category-content` declares a
`min-height`. (A crude but honest gate — the real check is visual; note it
in the commit message.)

## G10: Reset the world when returning to the main menu

**File**: `src/game-flow/MatchFlowController.ts` (`returnToMenu`).
- After the existing state resets, if a physics handle is initialised, call
  `this.requirePhysics().resetWorld({ carCreationOrder: [PLAYER_CAR_ID,
  OPPONENT_CAR_ID], kickoffVariantIndex: 0 })` and reset
  `this.kickoffCounter = 0`. This puts ball + cars back at the neutral
  kickoff pose under the menu ghosts (the physics ball IS the menu ball per
  R8, so the menu reads fresh again).
- Guard: skip the reset in `guestMode` (an online guest's world is
  authoritative-remote; by the time it returns to menu the session is over,
  but the guard is free and correct).

**Gate G10** — extend `tests/unit/matchFlow.spec.ts` (it already drives a
`MatchFlowController` + `PhysicsFacade`): start a match, apply an impulse to
the ball / drive it away from origin, `returnToMenu()`, then assert the
ball's position is back at the kickoff spot (x≈0, z≈0) and both cars are at
their kickoff poses (compare against a fresh `resetWorld` world snapshot).
No hash impact (menu-only path — the determinism script never calls
returnToMenu; verify the suite stays green without a bump).

---

## Suggested order

G9 → G10 → G4 (no-hash, quick wins) → G1 → G2 → G3 (visual world) →
G5 → G6 → G7 (physics; each bumps the hash — bump per-commit, don't batch).

## Appendix: live verification (recommended after G5/G7)

Same two-browser recipe as plan/ONLINE_POLISH_PLAN.md Appendix A, or
single-browser via the `run` skill for SP-only checks:
- G5: drive up the end wall beside the goal, steer across the goal mouth at
  wall height y<6 — the car must fall into the mouth, never bounce off air;
  fly along the wall just above the goal (y 6.5-7) — no mid-air bounce 1 m
  before the wall.
- G7.a: front-flip repeatedly — the car should ease into wheels-down with no
  visible end-of-flip snap.
- G1/G2: from the menu camera, moon + asteroids visible over the arena's
  open end; FPS unchanged (rule 3: +2 draw calls).
