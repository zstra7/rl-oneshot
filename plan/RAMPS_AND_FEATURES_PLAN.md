# Ramps, Arena, Gameplay & Tournament Plan (one-shot implementation)

This plan is written to be executed in a single autonomous session, workstream by
workstream, in order (R1 → R14). Every workstream is **gated by tests written or
updated inside that workstream** — do not move on until its verification block is
green, and **commit + push at every marked commit point** (see §0.3 for why this is
non-negotiable in this environment).

All user-reported issues and requested features, mapped to workstreams:

| Report | Workstream |
|---|---|
| Ghost ramp mid-field you can drive through | R1 |
| Side-wall ramps: physics works, invisible visuals | R1 |
| Goal-side ramps: visible but backwards/dark, physics broken | R1 |
| Corners must meet smoothly; drive all around the walls | R1 |
| Ramps as visible as the floor; none across the goal mouth | R1 |
| Hex pattern too dark — emissive, faint, transparent but visible | R2 |
| Wall pillars skinnier, more spaced, more visible | R2 |
| Auto-flip: also sides/nose/tail stands, works while drifting, player + AI | R3 |
| Default graphics to clean/max; bump each preset's resolution | R4 |
| Camera swings left/right during flips (non-ball-cam) | R5 |
| Goal-scored blast force on nearby cars | R6 |
| "WHAT A SAVE!" ×3 top-left when AI scores, fade out | R7 |
| Two balls visible in the main menu | R8 |
| New "legend" AI difficulty (also selectable in match setup) | R9 |
| All controls rebindable (keyboard + controller); defaults for every action; air-roll sensitivity setting | R10 |
| Menus fully navigable with a controller | R11 |
| Customise car menu (body colour + boost colour, live preview, polished) | R12 |
| Tournament mode (4 rounds, bracket, victory screen, leave option) | R13 |
| Final integration pass | R14 |

Product decisions already confirmed with the user:
- **Legend difficulty**: a real 4th tier, exposed in match setup too (not tournament-only).
- **Tournament**: player picks match length (1/3/10 min) once at tournament start; a loss
  shows an ELIMINATED state on the bracket screen with RETURN TO MENU.
- **Car customisation scope**: custom tint applies to the car body materials and the
  player's boost-trail VFX only. HUD, goal frames, arena accents stay cyan/magenta.
  Persisted in settings.
- **Resolutions**: authentic 480×270, balanced 640×360, clean 960×540; default preset
  `clean`.

---

## §0 Ground rules, harness, environment

### §0.1 Verification commands (used throughout)

```bash
npx vue-tsc --noEmit                     # typecheck — run after every file group
npx vitest run                           # unit suite (baseline: 29 files / 227 passing)
npm run validate                         # contracts / three.js skills / assets / architecture
# Playwright (dev server on 5173 must exist; preview on 4173 needs a test-mode build):
export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
rm -rf dist && PLAYWRIGHT_TEST=1 npx vite build      # preview project needs test hooks
npx playwright test <paths> [--project=chromium-dev]
npx playwright test                      # full suite at workstream boundaries (190+ tests)
npm run test:release                     # plain build + smoke/release, must stay 7/7
```

Known/expected: running the **full** Playwright suite against the test-mode preview
build fails exactly one test ("no `window.__GAME_TEST__` … debug hooks are exposed on a
plain production build") on both projects. Those 2 failures are the documented artifact
of serving a `PLAYWRIGHT_TEST=1` build; `npm run test:release` (which does a genuine
plain build) is the real gate for them and must be fully green.

### §0.2 Environment facts

- Playwright's default browser registry is missing; always export
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- A dev server usually already runs on 5173 (config has `reuseExistingServer`). If a
  server must be started manually, use `setsid nohup … < /dev/null & disown` — plain
  `nohup … &` dies between shell invocations here.
- Never trust a chained `cmd1; cmd2; build` bash line that exited with a signal —
  verify `dist/` content hashes actually changed after rebuilds.
- Three.js runs fine in Vitest's node environment — unit tests may build and traverse
  the stadium scene graph directly. No DOM/canvas textures exist in that path
  (`stadiumTextures` is undefined there); all visual factories must keep their
  texture-optional fallbacks.

### §0.3 Commit discipline (critical)

This environment has twice **silently reset the local checkout to a stale commit,
destroying all uncommitted work** (documented in `docs/build-decisions.md`). Therefore:
commit and push (`git push -u origin claude/master-build-brief-u8agzk`) **immediately
after each workstream's typecheck passes**, before long verification runs; amend/add
follow-up commits for test fixes. Never batch multiple workstreams into one commit.

### §0.4 Test-gating discipline

Each workstream below has a **Gates** section listing (a) new tests, (b) existing tests
that must be updated, (c) existing tests that must keep passing untouched. For the
arena work (R1), write the geometry-invariant unit tests **first** (they encode the
bugs), watch them fail against the current code, then implement. For everything else,
implement then test in the same workstream — but a workstream is not done until its
whole Gates list is green plus `npx vitest run` and the targeted Playwright files pass.

---

## R1 — Arena ramps & corners overhaul (highest priority)

### R1.1 Verified root causes (current code)

All in `src/assets/procedural/StadiumGeometryFactory.ts` (`createWallFillets`,
lines ~208-255) and `src/physics/arena/TestArenaPresets.ts` (`fillet()`, lines ~175-208):

1. **Mid-field drive-through ramp** — the *right* side-wall visual fillet uses
   `rotation.set(Math.PI / 2, 0, Math.PI / 2)`. Under three.js Euler XYZ
   (R = Rx·Ry·Rz), the cylinder's local Y axis (its 60 m length axis) maps to
   world **X**, not Z: `Rz(π/2)·Y = (-1,0,0)`, then `Rx(π/2)` leaves it on X. The
   60 m quarter-pipe tube therefore lies **across the field** centred at
   `(18, 2, 0)`, spanning x ∈ [-12, 48] — the ghost ramp. It has no collider (the
   physics fillet for that wall is correct), so you drive straight through it.
2. **Invisible side ramps** — the *left* fillet is positioned/rotated correctly
   (axis maps to −Z), but the visual is an **open-ended `CylinderGeometry`** whose
   outward faces point away from the arc centre. Viewed from inside the arena you
   look at the concave (back) side; the material (`floorMaterial`) is default
   `FrontSide` → **backface-culled, invisible**. Additionally since WS8 the shared
   `floorMaterial` is a near-black unmapped base (`0x11131a`) — even un-culled
   faces render as "really dark".
3. **Goal-side ramps look backwards + physics broken** —
   - *Visual*: `rotation.set(0, 0, Math.PI / 2)` maps the quarter-arc sweep to the
     **+Y/+Z quadrant**: the mesh occupies world y ∈ [2, 4] above its position —
     a lip floating above where the ramp should be, curving the wrong way
     ("backwards"), in the same near-black material ("really dark").
   - *Physics*: in `fillet()`, the `axis === "z"` branch reuses
     `angle = sign * theta` with `quatAxisX(angle)`. Rotating +Y about +X by +θ
     tips the surface normal toward **+Z** — for the far (+Z) wall that is *into
     the wall*, and for the near (−Z) wall the −θ case tips it into that wall too.
     **Both end-wall fillet runs present overhanging, wall-facing surfaces** — the
     car noses into segment edges and stops: "I just drive straight into the wall."
     (The correct rotation for `axis === "z"` is `quatAxisX(-sign * theta)`.)
4. **No corner geometry at all** — the four wall-wall corners are square; side
   fillet runs (full length) and end fillet runs simply interpenetrate at right
   angles. Driving along a wall into a corner is a 90° dead stop.

### R1.2 Design: one generator, consumed by both physics and visuals

Replace the two divergent implementations with a **single parametric generator**
whose output drives *both* the Rapier colliders and the rendered meshes. The visuals
become thin boxes identical to the collider boxes — what you see is exactly what you
drive on, eliminating the whole visual/physics mismatch bug class permanently.

New file: `src/physics/arena/ArenaRampGeometry.ts`

```ts
import type { QuatLike, Vec3Like } from "@/physics/PhysicsTypes";

export interface RampSegmentSpec {
  readonly kind: "floor-fillet" | "corner-wall";
  readonly halfExtents: Vec3Like;      // local: x = along-run, y = thickness/height, z = across-arc chord
  readonly translation: Vec3Like;
  readonly rotation: QuatLike;
}

export interface ArenaRampDimensions {
  readonly halfWidth: number;   // 20
  readonly halfLength: number;  // 30
  readonly height: number;      // 20
  readonly goalHalfWidth: number; // 7
}

export const RAMP_FILLET_RADIUS = 2.0;      // unchanged from WS5 — wall-drive tests are tuned to it
export const RAMP_FILLET_SEGMENTS = 5;
export const RAMP_SEG_HALF_THICK = 0.12;
export const CORNER_RADIUS = 6.0;
export const CORNER_PANELS = 6;             // 15° per panel
export const CORNER_PANEL_HALF_THICK = 0.5; // matches WALL_HALF_THICKNESS

export function generateArenaRamps(dims: ArenaRampDimensions): readonly RampSegmentSpec[];
```

**Quaternion helpers** — add to `src/physics/Vec3Math.ts` (with unit tests):

```ts
export function quatFromAxisAngle(axis: Vec3Like /* unit */, angle: number): QuatLike {
  const s = Math.sin(angle / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}
/** Standard Hamilton product; result applies `b` first, then `a`. */
export function quatMultiply(a: QuatLike, b: QuatLike): QuatLike;
```

**Core fillet run** (private in ArenaRampGeometry) — generalises the *proven* side-wall
math to any horizontal wall line, with a runDir choice that makes the tilt sign
automatically correct for every wall (this kills the axis-z sign-bug class):

```ts
/**
 * One quarter-round floor→wall fillet run.
 * wallBase: centre of the run, ON the wall plane, at floor level (y = 0).
 * inward:   unit horizontal vector from the wall INTO the field.
 * Template box local axes: X = run direction, Y = surface normal, Z = arc chord.
 *
 * runDir = (inward.z, 0, -inward.x) guarantees that rotating +Y about runDir by
 * +theta tips the surface normal toward `inward` (proof: runDir × Y = inward),
 * so segments always ramp *up toward the wall* with their drivable face into
 * the field — for every wall and every corner panel, with no per-wall signs.
 */
function filletRun(wallBase: Vec3Like, inward: Vec3Like, runHalfLength: number): RampSegmentSpec[] {
  const R = RAMP_FILLET_RADIUS, t = RAMP_SEG_HALF_THICK;
  const runDir = { x: inward.z, y: 0, z: -inward.x };
  const yawAngle = Math.atan2(runDir.x, runDir.z);            // rotate local +Z? see below
  const chordHalf = ((R * (Math.PI / 2)) / RAMP_FILLET_SEGMENTS) * 0.6;
  const specs: RampSegmentSpec[] = [];
  for (let i = 0; i < RAMP_FILLET_SEGMENTS; i += 1) {
    const theta = (i + 0.5) * (Math.PI / 2 / RAMP_FILLET_SEGMENTS);
    const inset = R - (R - t) * Math.sin(theta);              // distance in from the wall plane
    const y = R - (R - t) * Math.cos(theta);
    // Template: halfExtents { x: chordHalf, y: t, z: runHalfLength } with local Z along runDir.
    const qYaw = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, yawAngle);   // maps local +Z → runDir
    const qTilt = quatFromAxisAngle(runDir, theta);
    specs.push({
      kind: "floor-fillet",
      halfExtents: { x: chordHalf, y: t, z: runHalfLength },
      translation: {
        x: wallBase.x + inward.x * inset,
        y,
        z: wallBase.z + inward.z * inset
      },
      rotation: quatMultiply(qTilt, qYaw)
    });
  }
  return specs;
}
```

Sanity anchor (must hold, and is unit-tested): for the **right wall**
(`wallBase = (20,0,0)`, `inward = (-1,0,0)`), `runDir = (0,0,1)`, `yawAngle = 0`,
so the output reduces *exactly* to today's working side-wall collider specs
(`quatAxisZ(+θ)`, x = 20 − inset). For the **far end wall** (`inward = (0,0,-1)`),
`runDir = (-1,0,0)` and the tilt becomes rotation about −X by θ ≡ `quatAxisX(-θ)` —
precisely the fix for root cause #3.

**Corner walls + corner fillets** — per corner `(sx, sz) ∈ {±1}²`:

```
arcCentre A   = (sx·(halfWidth − Rc), 0, sz·(halfLength − Rc))         // (±14, 0, ±24)
outward(α)    = (sx·cos α, 0, sz·sin α),  α ∈ [0, π/2]                 // α=0 touches side wall, α=π/2 end wall
Δ             = (π/2) / CORNER_PANELS
per panel i:  αmid = (i + 0.5)·Δ
  chordHalf   = Rc · sin(Δ/2)                                          // ≈ 0.785 for Rc=6, 6 panels
  panelCentre = A + outward(αmid) · (Rc · cos(Δ/2))                    // chord plane; ends lie ON the arc,
                                                                       // flush with the straight walls at α=0, π/2
  corner-wall spec: halfExtents { x: chordHalf + 0.05, y: height/2, z: CORNER_PANEL_HALF_THICK },
                    translation (panelCentre.x, height/2, panelCentre.z),
                    rotation qYaw mapping local +Z → outward(αmid)     // vertical panel, thickness radial
  corner fillet: filletRun(wallBase = (panelCentre.x, 0, panelCentre.z),
                           inward  = −outward(αmid),
                           runHalfLength = chordHalf + 0.1)            // slight overlap hides seams
```

**Straight runs** (shortened to meet the corners; goal mouths stay clear):

```
side walls  (2): filletRun((±halfWidth, 0, 0),      inward ∓x, runHalfLength = halfLength − Rc)      // z ∈ [−24, 24]
end walls   (4): filletRun((±cx, 0, ±halfLength),   inward ∓z, runHalfLength = (halfWidth − Rc − goalHalfWidth)/2)
                 where cx = goalHalfWidth + runHalfLength = 7 + 3.5 = 10.5                            // x ∈ [7, 14]
```

Segment inventory: 10 (side fillets) + 20 (end fillets) + 120 (corner fillets 4×6×5)
+ 24 (corner wall panels) = **174 specs**. Boost pads verified clear of the corner
cut (`BoostPadLayout.ts`: max pad |x| = 14 at |z| = 20; corner cut region needs
|x| > 14 AND |z| > 24) — no pad moves needed.

### R1.3 Physics consumption — `src/physics/arena/TestArenaPresets.ts`

- Delete `fillet()`, `filletColliders()`, `FILLET_RADIUS`, `FILLET_SEGMENTS`,
  `FILLET_SEG_HALF_THICK`, `quatAxisZ`, `quatAxisX` (the generator owns all of it).
- In `boxArenaColliders()`, replace `...filletColliders()` with:

```ts
...generateArenaRamps({
  halfWidth, halfLength, height,
  goalHalfWidth: GOAL_HALF_WIDTH
}).map((spec) => ({
  halfExtents: spec.halfExtents,
  translation: spec.translation,
  rotation: spec.rotation
}))
```

- **Keep** the existing full-length flat wall colliders unchanged as backstops behind
  the corner panels (overlapping statics are harmless in Rapier and they close any
  seam at panel joins).

### R1.4 Visual consumption — `src/assets/procedural/StadiumGeometryFactory.ts`

- Delete `createWallFillets` and the `stadium-fillet-side-v1` / `stadium-fillet-end-v1`
  geometries entirely. Remove the `floorMaterial` parameter threading for fillets.
- New `createArenaRamps(context)` added to the root group:
  - Import `generateArenaRamps`, `CORNER_RADIUS` and the physics dimension constants
    (`TEST_ARENA_DIMENSIONS`, `GOAL_HALF_WIDTH`) **directly from physics** — this is
    the established pattern (`AssetTypes.ts` already imports `GOAL_HALF_WIDTH`;
    `validate-architecture` only bans store imports for assets). Do NOT re-derive
    from `stadiumDimensions` — one dims source for ramp geometry.
  - **Ramp material** `stadium-ramp-v1` — "as visible as the floor" means literally
    the floor's texture family:
    ```ts
    const rampTexture = context.stadiumTextures?.floorPanelSet?.[0];
    new THREE.MeshStandardMaterial({
      map: rampTexture ?? null,
      color: rampTexture ? 0xffffff : 0x8a929e,   // light fallback, never the dark base
      roughness: 0.9, metalness: 0.05
    });
    ```
  - For each `kind === "floor-fillet"` spec: `THREE.Mesh(BoxGeometry(hx*2, hy*2, hz*2), rampMaterial)`,
    `mesh.name = "RampSegment"`, position/quaternion copied from the spec. Reuse
    geometries via `geometryRegistry` keyed by rounded half-extents
    (`ramp-box-${hx}-${hy}-${hz}` with 3-decimal rounding) — there are only ~4 unique
    sizes, so this stays at 2–4 GPU geometries.
  - For each `kind === "corner-wall"` spec: same box construction with the **glass
    material** (passed in), `mesh.name = "CornerWallPanel"`,
    `renderOrder = SHELL_RENDER_ORDER`.
- **Shorten the straight glass walls to meet the corners** (avoids double-alpha
  overlap seams): side wall `BoxGeometry` length `fieldLength` → `fieldLength − 2*CORNER_RADIUS`
  (key bump to `stadium-side-wall-v2`); end-wall side segments in
  `createEndWallWithGoalGap`: `sideSegmentWidth = fieldWidth/2 − CORNER_RADIUS − goalWidth/2`
  centred at `±(goalWidth/2 + sideSegmentWidth/2)` (key `stadium-end-wall-side-v2`).
  Lintel and ceiling unchanged.
- Structural ribs: constrain rib placement to `|z| ≤ halfLength − CORNER_RADIUS` so no
  rib floats inside the corner arc (adjust the loop in `createStructuralRibs`; R2
  retunes spacing anyway — do both there if preferred, but the corner clamp belongs
  to R1).

### R1.5 Test-hook extension

`AssetPipeline.getStadiumShellInfo()` (and its type in
`src/assets/testing/BrowserAssetTestApi.ts`) gains:

```ts
rampSegmentCount: number;      // meshes named "RampSegment"
cornerPanelCount: number;      // meshes named "CornerWallPanel"
rampMaterialTextured: boolean; // ramp material has a map (or luminance > 0.3 fallback)
maxRampCentreDistanceFromWalls: number; // see gate (5)
```

### R1.6 Gates

**(a) New unit tests — `tests/unit/arenaRampGeometry.spec.ts`** (write FIRST; the
invariants encode every bug above):

1. *Anchor regression*: for the right wall run, generator output matches the known-good
   legacy values — segment 0 translation ≈ `(20 − (2 − 1.88·sin(9°)), 2 − 1.88·cos(9°), 0)`,
   rotation ≈ `quatAxisZ(+9°)` (compare quaternion components, ε = 1e-6).
2. *Normals never overhang, always field-facing*: for every `floor-fillet` spec, the
   world surface normal `n = applyQuaternion((0,1,0), rotation)` has `n.y > 0.05`; its
   horizontal part points **away from the wall into the field**: for straight runs,
   `dot(nXZ, inward) ≥ -1e-6`; first segment of each run has `n.y > 0.95`; last segment
   `n.y < 0.35`. (Current end-wall physics fails this — proves the bug, gates the fix.)
3. *Nothing mid-field*: no spec translation with `|x| < halfWidth − (R + 1)` **and**
   `|z| < halfLength − (R + 1)` … except corner specs, which must satisfy
   `distance(translation.xz, cornerArcCentre) ∈ [Rc − R − 0.5, Rc + 1]` for their
   corner. (Encodes the ghost-ramp regression *and* corner placement.)
4. *Goal mouths clear*: no spec with `|z| > halfLength − R − 0.5` has `|x| < goalHalfWidth − 0.2`.
5. *Coverage / no gaps*: sample stations every 0.25 along each wall base line
   (side walls z ∈ [−24, 24], end runs x ∈ [±7, ±14], corner arcs α ∈ [0, π/2] at the
   base radius); assert each station is within `chordHalf + 0.15` of some segment's
   run-axis extent (project the station onto each spec's local frame). Gap > 0.3 fails.
6. *Counts*: exactly 150 floor-fillet and 24 corner-wall specs.
7. *Physics/visual identity*: build `createStadiumBlockout` with a minimal context
   (registries + `SeededRandom(1)` + `DEFAULT_STADIUM_DIMENSIONS` +
   `PLACEHOLDER_PHYSICS_METADATA`, no textures) and assert a **bijection**: every
   generator spec has exactly one mesh (`RampSegment`/`CornerWallPanel`) whose world
   position and quaternion match within 1e-3, and no extra ramp meshes exist.
8. *Quat helpers*: `quatFromAxisAngle`/`quatMultiply` vs known values (`quatMultiply`
   result applied via existing `applyQuaternion` equals sequential application).

**(b) New/updated physics driving tests — extend `tests/unit/wallDriving.spec.ts`:**

9. Keep the existing left-wall climb test unchanged (tuning anchor).
10. Add the identical climb test for: right wall (+X), near end wall (drive −Z at
    x = 10.5), far end wall (drive +Z at x = −10.5). Same assertions: final height > 2,
    grounded-on-fillet ratio ≥ 0.7, `maxLinvelDelta ≤ 12`. **These directly gate "the
    goal-side ramp physics works".** (Spawn ≥ 8 m out, face the wall via
    `quaternionFacing`, throttle+boost, 360 ticks.)
11. *Corner smoothness*: spawn at `(-8, 0.4, 16)` facing `(-1, 0, 1)/√2` (straight at
    the (−1,+1) corner), throttle+boost 300 ticks: assert max height reached > 1.5
    (climbed the corner), `maxLinvelDelta ≤ 14` (no square-wall slam), final speed > 3
    (didn't stick), position stays inside `|x| ≤ 21, |z| ≤ 31`.
12. *Ray-closure sweep* (catches any hole/gap at any angle): using
    `physics.raycastArena` from `(0, 1, 0)` and `(0, 3, 0)`, directions every 3° in the
    horizontal plane, `maxDistance 60`: every ray hits (non-null), and hit distance ∈
    [17.5, 40] (lower bound = fillet base minus margin — also re-encodes "nothing
    mid-field" against the *real* collider set; upper bound covers goal boxes).

**(c) New Playwright — `tests/visual-language/arena-ramps.spec.ts`:**

13. `getStadiumShellInfo()`: `rampSegmentCount === 150`, `cornerPanelCount === 24`,
    `rampMaterialTextured === true` (textures ARE loaded in-browser).
14. Live smoke: start match, teleport player car to face the far end wall run
    (`setCarState` position `(10.5, 0.4, 18)` facing +Z, then hold real `KeyW` +
    boost for ~1.5 s with runtime resumed — reuse the `tests/physics/car-driving.spec.ts`
    input pattern): assert car `position.y` exceeded 1.5 at some sample and no console
    errors. This is the end-to-end "I can drive up the goal-side ramp" proof.

**(d) Existing tests that must keep passing / be updated:**

- `tests/unit/wallDriving.spec.ts` third test (idle-car numerical stability) — keep.
- `tests/visual-language/arena-shell.spec.ts` — `transparentMeshCount ≥ 6` still true
  (corner panels add 24 more); update the assertion to `≥ 30` to lock the corners in.
- `tests/unit/physicsFacade.spec.ts`, kickoff/AI suites — unaffected (spawns at
  |x| ≤ 8, |z| ≤ 24 clear the corner cut), but run the full unit suite to prove it.
- `docs/physics-deviations.md` + `docs/visual-language-deviations.md`: new "Arena ramps
  v2" section — root causes above, the runDir invariant, the shared-generator decision.

**Commit point R1** (source + tests + docs), then run full vitest + targeted Playwright.

---

## R2 — Hex shell emissive + rib tuning

### Changes (`StadiumGeometryFactory.ts`)

1. Glass material — bump registry key to `stadium-glass-shell-v2`:
   ```ts
   const hexTexture = createHexShellTexture();
   hexTexture.repeat.set(10, 10);
   new THREE.MeshStandardMaterial({
     color: 0x9fd8ff, map: hexTexture,
     emissive: new THREE.Color(0x66d4ff),
     emissiveMap: hexTexture,          // same texture: hex lines glow, background (0,0,0,0) doesn't
     emissiveIntensity: 0.85,
     transparent: true, opacity: 0.28, // up from 0.16 — still clearly see-through
     roughness: 0.15, metalness: 0.6, side: THREE.DoubleSide, depthWrite: false
   });
   ```
   (`emissiveMap` multiplies by texture RGB, so the transparent-black background stays
   dark and only the hex lines glow — exactly "faint and transparent but visible".)
2. Ribs — key bumps `stadium-rib-v2` (material and geometry):
   - `RIB_WIDTH 0.4 → 0.22`, `RIB_DEPTH 0.5 → 0.4`, `RIB_SPACING 4 → 6`
     (→ `ribCount = floor(60/6) = 10` per side, 20 instances).
   - Material `color 0x0c0e15 → 0x39414f`, add `emissive 0x18222e`,
     `emissiveIntensity 0.6`.
   - Clamp rib z-range to `|z| ≤ halfLength − CORNER_RADIUS` (if not already done in R1).

### Gates

- **New unit test `tests/unit/stadiumVisuals.spec.ts`**: build `createStadiumBlockout`
  with a minimal context; find the glass material via a wall mesh: assert
  `emissiveIntensity ≥ 0.6`, `emissiveMap` set and === `map`'s texture class,
  `opacity` ∈ [0.2, 0.4], `transparent === true`. Find `SideWallRibs` InstancedMesh:
  `count === 20`, geometry `parameters.width` ≈ 0.22, material emissive ≠ black.
- Update `getStadiumShellInfo` opacity threshold: its transparent-mesh predicate is
  `opacity < 0.5` — 0.28 still passes; assert unchanged behaviour by re-running
  `arena-shell.spec.ts`.
- Existing psx-pipeline "no shader errors" tests must stay green (emissiveMap on
  MeshStandardMaterial is standard, but run them).
- Docs: `visual-language-deviations.md` entry.

**Commit point R2.**

---

## R3 — Auto-flip v2 (sides, nose/tail stands, works while drifting)

### Root cause of the complaint

`applyAutoFlipIfStranded` (`src/physics/PhysicsFacade.ts`) only fires when
`up.y < -0.35` (near-fully upside down) **and** linear speed < 2.0 **and** angular
speed < 2.0 for a full 1.0 s. A car resting on its **side** (`up.y ≈ 0`) or standing
on its **nose/tail** never qualifies; a car still sliding at 3 m/s waits until it
fully stops ("you have to wait for the car to stop completely").

### Changes (`src/physics/PhysicsFacade.ts`)

Replace constants + predicate (function rename to `applyAutoFlipIfStrandedV2` not
needed — keep name, update doc comment):

```ts
const AUTO_FLIP_UPRIGHT_UP_Y = 0.55;          // below this the car is not in a driveable pose
const AUTO_FLIP_SPEED_THRESHOLD = 6.0;        // was 2.0 — "still drifting" must qualify
const AUTO_FLIP_ANGULAR_SPEED_THRESHOLD = 4.0;// was 2.0 — slight rocking must qualify
const AUTO_FLIP_MAX_HEIGHT = 1.2;             // near-floor only; never mid-air or up a wall
const AUTO_FLIP_SECONDS = 0.75;               // was 1.0 — snappier
```

```ts
const strandedNonUpright =
  up.y < AUTO_FLIP_UPRIGHT_UP_Y &&
  translation.y < AUTO_FLIP_MAX_HEIGHT &&
  V.length(linvel) < AUTO_FLIP_SPEED_THRESHOLD &&
  V.length(angvel) < AUTO_FLIP_ANGULAR_SPEED_THRESHOLD &&
  // Actively wall-driving exemption: a car gripping a wall/fillet with throttle
  // held is exactly the "supportNormal horizontal + grounded" pose — never flip it.
  !(car.runtime.grounded &&
    car.runtime.supportNormal.y < 0.7 &&
    Math.abs(car.currentInput.throttle) > 0.05);
```

Righting action stays as-is (preserve yaw via flattened forward, +0.5 y pop, zero
angvel) — **do not zero linear velocity** (a drifting car keeps its slide, upright).
Note in the doc comment: `dodgeState === "active"` never survives the angular gate
(dodges spin > 4 rad/s), and aerials never pass the height gate; the throttle-gated
wall exemption covers low-wall crawling. Applies to every car in the registry —
player and AI both (already true; state it in the comment).

### Gates (rewrite `tests/unit/autoFlip.spec.ts`)

1. Upside-down stationary car rights by 1.25 s (update the halfway-tick constants for
   the 0.75 s timer) — adapt existing test.
2. **New**: car on its left side (`rotation = quatAxisZ(π/2)` → up ≈ (−1,0,0)… compute
   via THREE and assert `upY ≈ 0` precondition) at y 0.5, drifting `linvel (3, 0, 1)`:
   rights within 1.5 s **and** horizontal speed after righting ≥ 2 (drift preserved).
3. **New**: nose-stand (`rotation = quatAxisX(-π/2)`, forward pointing down) → rights
   within 1.5 s. Same for tail-stand (`quatAxisX(π/2)`).
4. **Rewritten** fast-slide negative: upside-down car sliding at 8 m/s (above 6) held
   by re-assertion each tick → NOT righted in 200 ticks (`upY < −0.5` still).
5. **New** wall-driving regression: place the car mid-climb on the left wall fillet
   (position `(−19.3, 2.5, 0)`, rotation facing −X tilted so up ≈ (+1,0,0) — reuse
   `quaternionFacing` patterns from wallDriving spec), `throttle 1`, step 240 ticks:
   the car must never be teleport-righted (track `position.y` continuity: no
   single-tick +0.5 jump paired with up.y snapping to 1; simplest robust assertion —
   `car.runtime` isn't exposed, so assert `upY` never jumps from < 0.7 to > 0.99
   between consecutive ticks).
6. **New** upright-brake regression: upright car decelerating 5 → 0 over 300 ticks
   never gets the +0.5 y pop (`position.y` stays < 0.6).
7. Existing WS7 kickoff/physics suites all green (`npx vitest run`).

Docs: `physics-deviations.md` — v2 thresholds, why the wall exemption is throttle-gated.

**Commit point R3.**

---

## R4 — Graphics: resolutions up, default `clean`

### Changes

1. `src/visual-language/PsxRenderSettings.ts`:
   - authentic `320×180 → 480×270`; balanced `426×240 → 640×360`; clean `640×360 → 960×540`.
     `jitterGrid` values stay unchanged.
2. Default preset `"balanced" → "clean"` in **all four** places:
   - `settingsStore.DEFAULT_SETTINGS.graphics.preset`
   - `PlaceholderSceneRenderer` fields (`visualPreset`, `effectiveSettings` initialisers)
   - `AssetPipeline.initialise` context `visualPreset`
   - `PlaceholderSceneRenderer.getVisualPreset()`'s `?? "balanced"` fallback in
     `GameRuntime` (grep `"balanced"` across `src/` and update every default).

### Gates

- Update `tests/unit/psxVisualLanguage.spec.ts` (preset table test + the two
  `getInternalResolution` pipeline tests at lines ~139/146).
- Update `tests/visual-language/psx-pipeline.spec.ts`: "defaults to the balanced preset
  (426×240)" → "defaults to the clean preset (960×540)"; the preset-switch test's
  authentic assertion → 480×270, clean → 960×540.
- Update `tests/ui/settings.spec.ts` line ~29 (authentic 320×180 → 480×270).
- Grep tests for `426`, `640, height: 360`, `320, height: 180` to catch stragglers.
- `npm run test:release` must stay green (release-gate doesn't assert resolutions —
  verify by grep before assuming).
- Docs: `visual-language-deviations.md`.

**Commit point R4.**

---

## R5 — Camera stays straight through flips (non-ball-cam)

### Root cause

`ChaseCameraController.updateChaseCamera` (normal cam branch) recomputes the chase
direction every frame from the car's flattened forward vector. During a dodge the body
tumbles: the flattened forward swings (diagonal/side flips) or degenerates
(front/back flips through vertical, caught only at `lengthSq < 0.01`), so the yaw
target swings and then "corrects". Ball cam is immune because its direction comes from
car↔ball positions.

### Change (`src/camera/ChaseCameraController.ts`)

- Fetch the player car state once at the top of `updateChaseCamera`
  (`this.physics.getCarState(this.playerCarId)` — also reuse it in `updateFov` via a
  parameter instead of its own fetch).
- New field `private dodgeYawHold: number | null = null;`
- In the normal-cam branch, before computing `chaseDirection` from forward:

```ts
const dodging = playerCar.dodgeState !== "none";   // "active" | "recovery"
if (!this.ballCameraEnabled && dodging) {
  if (this.dodgeYawHold === null) this.dodgeYawHold = this.smoothedYaw;
  chaseDirection = new THREE.Vector3(Math.sin(this.dodgeYawHold), 0, Math.cos(this.dodgeYawHold));
} else {
  this.dodgeYawHold = null;
  // …existing forward-derived direction…
}
```

  (`rearViewHeld` negation stays applied after, so rear-view during a flip still works.
  When the dodge ends the normal smoothing blends back to the car's actual heading —
  matching RL's behaviour of the camera holding line through the flip.)

### Gates

**New unit test `tests/unit/cameraFlipYaw.spec.ts`** (the camera controller is
constructible in vitest — three.js PerspectiveCamera + real PhysicsFacade + a gameFlow
stub `{ getMatchState: () => "PLAYING" } as MatchFlowController`):

1. Spawn player car at origin facing −Z, drive to ~10 m/s (throttle input, ~120 ticks),
   run `updateRenderFrame` each tick (fixed `frameDeltaSeconds = 1/120`) until yaw
   settles; record `settledYaw` from diagnostics quaternion (derive camera yaw via
   `atan2` of camera→target).
2. Trigger a real diagonal dodge through inputs: `jump` press tick, release, second
   `jump` press with `pitch = 1, steer/yaw = 1` (mirrors DodgeController expectations —
   copy the working input sequence from `tests/unit/dodgeFlip.spec.ts`), then step
   ~60 ticks calling `updateRenderFrame` each tick. Assert
   `maxAbsYawDeviation(settledYaw) < 0.06 rad` (~3.4°) while `dodgeState !== "none"`.
   **Write this test before the fix and confirm it fails** (it will — the swing is the
   bug), then implement.
3. Ball-cam control: same scenario with `ballCameraEnabled` toggled on (via
   `consumeCameraInput`) — behaviour unchanged (no regression assert: yaw tracks ball
   line within existing tolerance; just assert no NaN and test passes).
4. Existing `tests/camera/*.spec.ts` Playwright suites all green (they never dodge
   mid-assert; run to prove).

**Commit point R5.**

---

## R6 — Goal-blast force on nearby cars

### Design

Real-RL demolition-style shockwave when a goal is scored: cars near the scored-on goal
mouth get thrown away from it. Physics owns the impulse; game-flow decides when.

### Changes

1. `src/physics/PhysicsFacade.ts` — new public method:

```ts
/** Radial "goal explosion" impulse: cars within `radius` of `centre` get a
 *  velocity change of up to `maxDeltaV` (linear falloff), directed away from
 *  `centre` (horizontal) with a 0.35 upward component, mass-scaled. */
public applyRadialCarImpulse(centre: Vec3Like, radius: number, maxDeltaV: number): void {
  for (const car of this.carRegistry.getAllStable()) {
    const toCar = V.sub(car.body.translation(), centre);
    const distance = V.length(toCar);
    if (distance > radius) continue;
    const falloff = 1 - distance / radius;
    const dirH = V.normalize({ x: toCar.x, y: 0, z: toCar.z });
    const dir = V.normalize({ x: dirH.x, y: 0.35, z: dirH.z });
    car.body.applyImpulse(V.scale(dir, RL_CONSTANTS.carMass * maxDeltaV * falloff), true);
  }
}
```

   (Degenerate `distance ≈ 0` guard: fall back to `dir = (0,1,0)`.)
2. `src/game-flow/MatchFlowController.ts` — in `processGoal(scoringTeam)`, before the
   state transitions:

```ts
const GOAL_BLAST_RADIUS = 16;
const GOAL_BLAST_MAX_DELTA_V = 18;
const goalCentre = this.requirePhysics().getGoalSensorCentre(otherTeam(scoringTeam));
if (goalCentre) {
  this.requirePhysics().applyRadialCarImpulse(goalCentre, GOAL_BLAST_RADIUS, GOAL_BLAST_MAX_DELTA_V);
}
```

   (`otherTeam` already imported in physics; import in the controller from
   `@/core/TeamTypes`. `getGoalSensorCentre` already exists.)

### Gates

**New unit test `tests/unit/goalBlast.spec.ts`:**
1. Physics method direct: car 4 m in front of the player goal centre, ball far away;
   `applyRadialCarImpulse(goalCentre, 16, 18)` → car speed ≥ 10, velocity direction
   points away from the goal (dot with car−goal horizontal > 0.7), `linvel.y > 0`.
2. Falloff/range: car at 25 m → speed change < 0.01.
3. Full flow via controller: `startMatch`-style setup (use `MatchFlowController` +
   real physics as `tests/unit/matchFlow.spec.ts` does), park a car at 5 m from the
   opponent goal, drive the ball into the goal sensor (`setBallState` velocity into
   the mouth, step until goal event) → after `applyPhysicsResults`, that car's speed
   jumped ≥ 6; a car parked at midfield stayed < 1.
4. Determinism/idempotence: exactly one impulse per goal (goalLatch) — step 120 extra
   ticks, speed decays monotonically (no second kick).

**Playwright** — extend `tests/game-flow/match-flow.spec.ts` with one test: start a
match, `setCarState("car-player", { position: 3 m from own goal })`, `simulateGoal("opponent")`
… note `simulateGoal` bypasses physics goal events (check
`BrowserGameFlowTestApi.simulateGoal` — it calls `processGoal` directly, which is fine:
the blast lives in `processGoal`), `advanceGameTicks(2)`, assert player car speed > 6.

Docs: `physics-deviations.md` (deliberate arcade addition).

**Commit point R6.**

---

## R7 — "WHAT A SAVE!" quick chat on AI goals

### Design

RL-style toxic quick-chat spam: when the **opponent scores**, the top-left shows
`CPU: WHAT A SAVE!` three times, staggered, fading out after ~2.5 s. Pure UI layer —
triggered by watching the mirrored session score (no engine changes).

### Changes

1. New `src/components/hud/QuickChatOverlay.vue`:
   - Mounted unconditionally in `App.vue` (above HUD, below scanlines).
   - `watch(() => matchFlowStore.session.opponentScore, (next, prev) => { if (next > prev) spam(); })`
     — increment-only guard means score resets (replay/menu) never trigger it.
   - `spam()`: push 3 entries `{ id, text: "WHAT A SAVE!" }` at 0 ms / 300 ms / 600 ms
     (setTimeout — DOM timers are fine even when the sim RAF is paused; tests use real
     waits); each entry auto-removes after 3000 ms with a CSS opacity transition
     (`.fading` class added at 2200 ms). Track pending timeout handles and clear them
     in `onBeforeUnmount`.
   - Template: fixed container top-left (`top: 4.5rem; left: 1rem`),
     `data-testid="quick-chat"`; each message `data-testid="quick-chat-message"`,
     styled with the wo- language: `.wo-panel`-ish slat, magenta `CPU:` prefix
     (`<span class="sender">CPU:</span>` — decorative, but it *is* real text; no test
     selects on it, and release-gate only greps testids — verified safe), `.wo-label`
     sizing, 200 ms slide-in.
   - Respect `settingsStore.settings.accessibility.reducedFlashes`: skip the slide/fade
     animation classes (content still appears/disappears; no flashing).
2. `App.vue`: add `<QuickChatOverlay />`.

### Gates

**New Playwright `tests/ui/quick-chat.spec.ts`:**
1. Start a 1-min match (deterministic tick pattern from match-flow.spec), then
   `simulateGoal("opponent")`; `expect(page.getByTestId("quick-chat-message")).toHaveCount(3)`
   within 1.5 s; texts all `WHAT A SAVE!`.
2. After ~4 s real wait, count === 0 (faded out and removed).
3. `simulateGoal("player")` → count stays 0.
4. Return to menu with a pending spam → no errors, overlay empties (unmount-safe).
5. Full `tests/game-flow/match-flow.spec.ts` still green (overlay must not intercept
   clicks — `pointer-events: none` on the container).

**Commit point R7.**

---

## R8 — Single ball in the main menu

### Root cause

At the menu, **two** balls render: the static `MenuGhostBall` from
`AssetPipeline.buildPlaceholderWorld` (floats at `y = ballRadius + 2`) *and* the live
physics ball rendered by `PhysicsRenderBinding` (resting on the floor at
`y = ballRadius` since WS5.B). The ghost cars happen to overlap the physics cars
exactly, so only the ball reads as doubled.

### Change (minimal, keeps WS7.C machinery intact)

- `AssetPipeline.buildPlaceholderWorld`: delete the `MenuGhostBall` mesh entirely
  (the physics-driven ball is the menu ball).
- `GameRuntime.updateMenuPresentationVisibility`: remove `"MenuGhostBall"` from the
  toggle name list.

### Gates

- Update `tests/procedural/placeholder-world.spec.ts` if it counts scene resources
  (it asserts `> 0` only — verify, likely untouched).
- `tests/game-flow/match-flow.spec.ts` WS7.C ghost-visibility test: unchanged
  (asserts the boolean flag only).
- **New assertion** in `tests/visual-language/arena-ramps.spec.ts` (or a small new
  `menu-scene.spec.ts`): at the menu, traversing the scene finds exactly **one** object
  named like a ball visual — add a scene-count hook `getSceneObjectCountByName(name)`
  to the asset/runtime test API, or simpler: assert `getObjectByName("MenuGhostBall")`
  is null via a one-line extension of `getStadiumShellInfo` → `hasMenuGhostBall: false`.
- `tests/assets/car-visual.spec.ts` "menu presentation shows both team-tinted car
  visuals" — must stay green (it relies on cars, not the ball; verify).

**Commit point R8** (can be folded into R2's commit if convenient — keep the test).

---

## R9 — "Legend" AI difficulty

### Changes

1. `src/ai/AiDifficulty.ts`:
   - `export type AiDifficulty = "easy" | "medium" | "hard" | "legend";`
   - `LEGEND_AI: AiDifficultyParameters` — tuned-up hard:
     `reactionDelaySeconds 0.045, ownStateDelaySeconds 0.005, perceptionPositionNoise
     0.07, perceptionVelocityNoise 0.1, predictionTimeNoise 0.02, tacticalHz 15,
     predictionHz 15, controlHz 120, planningHorizonSeconds 4.0, candidateCount 32,
     shotAccuracy 0.92, shotPowerPreference 0.82, defensiveUrgency 0.95,
     challengeAggression 0.8, boostConservation 0.4, maximumBoostBurstSeconds 1.4,
     boostPadAwarenessRadius 140, boostPadDetourToleranceSeconds 1.3,
     boostPadRespawnPlanningSeconds 3.0, boostDenialAggression 0.6,
     boostRouteCandidateCount 20, powerslideSkill 0.95, dodgeSkill 0.9,
     aerialSkill 0.6, recoverySkill 0.95, decisionTemperature 0.06,
     mistakeFrequency 0.015, commitmentSeconds 0.28, maximumAerialHeight 8.0,
     maximumAerialTime 1.5, kickoffProfile "fast"`.
   - `MISTAKE_COOLDOWN_SECONDS.legend = 10.0`; `AI_DIFFICULTY_PRESETS.legend = LEGEND_AI`.
2. Grep for exhaustive difficulty iteration: `MatchSetup.vue` `difficulties` array →
   `["easy", "medium", "hard", "legend"]` (chip auto-gets `data-testid="difficulty-legend"`);
   `OpponentAiController` uses the record lookups (no switch to extend — verify by
   grep `"hard"` in `src/ai/`); any `Record<AiDifficulty, …>` gets a legend entry
   (typechecker will find them all — run `vue-tsc` early).

### Gates

- `tests/unit/aiDifficulty.spec.ts`: round-trip test adds legend; **ordering test**
  extends to legend: `avg(legend) < avg(hard)` reaction lag over the same 5 seeds
  (existing `measureReactionLagTicks` — legend keeps `Math.min > 0` "not omniscient").
  Watch the 30 s timeout — bump `it(…, 45_000)` since there's now a 4th difficulty.
- `tests/ai/ai-difficulty.spec.ts` (Playwright): "match setup shows EASY/MEDIUM/HARD"
  test → add LEGEND chip visible + selecting it takes effect
  (`runtime.getAiDifficulty() === "legend"`).
- Full-match AI hardening tests still green.
- Docs: `ai-calibration-log.md` legend params + measured ordering numbers.

**Commit point R9.**

---

## R10 — Rebindable controls + air-roll sensitivity

### R10.1 Bindings model

New `src/input/bindings/BindingsConfig.ts`:

```ts
export interface KeyboardBindings {   // KeyboardEvent.code values
  accelerate: string; reverse: string; steerLeft: string; steerRight: string;
  pitchNoseDown: string; pitchNoseUp: string; yawLeft: string; yawRight: string;
  airRollModifierPrimary: string; airRollModifierSecondary: string;
  powerslide: string;                 // NEW distinct action (default ShiftLeft, replacing the loose consts)
  ballCamera: string; scoreboard: string; pause: string;
}
export interface MouseBindings { boost: number; rearView: number; jump: number; }
export interface GamepadBindings {   // button indices (existing shape, unchanged keys)
  accelerateButton: number; reverseButton: number; airRollModifierButton: number;
  jumpButton: number; boostButton: number; powerslideButton: number;
  ballCameraButton: number; scoreboardButton: number; pauseButton: number;
  rearViewButton: number;
}
export interface ControlBindings { keyboard: KeyboardBindings; mouse: MouseBindings; gamepad: GamepadBindings; }
export const DEFAULT_CONTROL_BINDINGS: ControlBindings = …  // built from the existing DEFAULT_* consts
```

Every in-game action has a default (they all already do — the table above is exactly
the current default surface; `POWERSLIDE_KEYBOARD_BINDING`/`_ALT` fold into
`powerslide` + `airRollModifierSecondary`). UI-navigation keys (`uiUp` etc.) stay
fixed and are **not** rebindable (they're not "controls" in the gameplay sense; note
this in docs).

### R10.2 InputControlsModule refactor

- Field `private bindings: ControlBindings = DEFAULT_CONTROL_BINDINGS;` +
  `setBindings(b: ControlBindings)`, `getBindings()`.
- Replace **every** hardcoded `DEFAULT_KEYBOARD_BINDINGS` / `DEFAULT_MOUSE_BINDINGS` /
  `DEFAULT_GAMEPAD_BINDINGS` / `POWERSLIDE_*` reference with `this.bindings.*`. The
  dangerous hidden ones: `handleKeyboardPress` hardcodes `"Space"`/`"Escape"`
  (→ `bindings.keyboard.ballCamera` / `.pause`); `handleMousePress/Release` jump
  edges; `pollGamepad` edge detection (jump/ballCamera/pause buttons) and the
  activation heuristics; `buildLogicalStateFromKeyboardMouse` (including
  `powerslideHeld: kb.isPressed(bindings.keyboard.powerslide) || airRollModifier`),
  `buildLogicalStateFromGamepad`, `sampleGameplayInputForTick`'s `rearViewHeld`,
  `sampleSystemInput` scoreboard.
- **Capture support** for the rebind UI:
  `startBindingCapture(device: "keyboard" | "mouse" | "gamepad")`,
  `cancelBindingCapture()`, `takeCapturedBinding(): { device; code?: string; button?: number } | null`.
  While armed: the next keyboard press / mouse press / gamepad button edge is stored
  as the capture (and suppressed from edges), keyboard `Escape` cancels. Gamepad
  capture hooks into the existing `pollGamepad` button-edge loop.
- `GameRuntime` facade: `setControlBindings`, `getControlBindings`,
  `startBindingCapture`, `takeCapturedBinding`, `setAirRollSensitivity` forwarding to
  the input module; wire into `installTestApis` runtime surface for Playwright.

### R10.3 Air-roll sensitivity (physics-real, works for digital and analog input)

- `src/physics/PhysicsTypes.ts` `CarControlProfile` += `airRollSensitivity: number`
  (default const `DEFAULT_AIR_ROLL_SENSITIVITY = 1.0`); mirror in
  `src/input/InputTypes.ts` `CarControlProfile`.
- `InputControlsModule` holds `airRollSensitivity` (setter, clamped 0.5–2.0), includes
  it in the per-tick `carControlProfile` (`sampleGameplayInputForTick`) — GameRuntime
  already forwards that to `physics.setCarControlProfile` every tick.
- `src/physics/car/AerialController.ts` `applyAerialRotation`: roll axis only —
  `RL_CONSTANTS.maxRollAngularAcceleration * car.controlProfile.airRollSensitivity`
  (verify `CarEntity.controlProfile` merge default covers old saves — `setCarControlProfile`
  merges partials, and `createCarEntity` must initialise the new field).

### R10.4 Settings + UI

- `settingsStore`: new section
  `controls: { keyboard: …, mouse: …, gamepad: …, airRollSensitivity: number }`,
  defaults from `DEFAULT_CONTROL_BINDINGS`; validation: keyboard values must be
  non-empty strings, mouse/gamepad values integers 0–17, unknown keys dropped, missing
  keys defaulted (field-by-field like every other section); `airRollSensitivity`
  clamped 0.5–2.0.
- Boot wiring (`GameCanvas.vue`): `runtime.setControlBindings(settings.controls)` +
  `runtime.setAirRollSensitivity(settings.controls.airRollSensitivity)`.
- `SettingsPanel.vue` CONTROLS tab rework:
  - Device chips `[KEYBOARD & MOUSE] [CONTROLLER]` (`data-testid="bindings-device-keyboard"` / `-gamepad"`).
  - One row per action: `.wo-label` name + binding chip
    (`data-testid="binding-<actionKey>"`, e.g. `binding-accelerate`,
    `binding-gamepad-boostButton`) showing a friendly label (`KeyW → W`,
    `Mouse 0 → LMB`, button index → `BTN 5` with names for standard indices).
  - Click a chip → capture mode ("PRESS A KEY…" / "PRESS A BUTTON…"):
    keyboard/mouse captured with **component-local** `window` listeners
    (keydown.code / mousedown.button, capture-phase, `preventDefault`), Escape
    cancels; gamepad captured by polling `runtime.takeCapturedBinding()` on a 100 ms
    interval after `runtime.startBindingCapture("gamepad")`.
  - On capture: `settingsStore.update({ controls: … })` then
    `runtime.setControlBindings(...)` (single helper `applyControls()`).
  - Duplicates are **allowed** (pitch/yaw share WASD by default — this is the RL
    model); show a subtle amber tint on chips whose value appears >1× in the same
    device map, no blocking.
  - `RESET TO DEFAULTS` button (`data-testid="bindings-reset"`).
  - `AIR ROLL SENSITIVITY` slider row (0.5–2.0, step 0.05,
    `data-testid="air-roll-sensitivity"`) — same slider pattern as camera rows.
  - Delete the now-dead `DEFAULT_*` imports and the "Rebinding is not yet available"
    hint.

### Gates

- **Unit `tests/unit/controlBindings.spec.ts`**: settings validation (bad codes,
  out-of-range buttons, missing sections → defaults; round-trip of a custom set);
  `DEFAULT_CONTROL_BINDINGS` covers every action key (compile-time via type, runtime
  via `Object.keys` snapshot).
- **Unit** air-roll physics: two cars, `setCarControlProfile` sensitivities 0.6 vs 1.8,
  identical `roll: 1` airborne input 60 ticks → accumulated |roll angle| ratio ≥ 2×
  (measure via up-vector angle from vertical about the forward axis, or simpler:
  local-Z angular velocity magnitudes ratio ≥ 1.5 after 30 ticks).
- **Playwright `tests/input/rebinding.spec.ts`**:
  1. Settings → CONTROLS → click `binding-accelerate` → `page.keyboard.press("KeyP")`
     → chip shows `P`; close settings, start match (real RAF), hold `P` → input
     diagnostics `output.car.throttle === 1`; hold `W` → throttle 0 (old key inert).
  2. Persistence: reload page → chip still `P`, gameplay still honours it.
  3. Gamepad: connect virtual pad, device chip CONTROLLER, click
     `binding-gamepad-boostButton`, `setVirtualGamepadState` button 5 pressed →
     chip `BTN 5`; in match, button 5 held → diagnostics `output.car.boost === true`.
  4. Reset-to-defaults restores W.
  5. Air-roll slider: set 2.0 → `runtime.getDiagnostics` (input) carControlProfile
     reflects 2.0.
- **Existing suites**: `tests/input/foundation.spec.ts` must pass **unmodified** —
  it exercises the default bindings end-to-end and is the no-regression anchor for
  the refactor. Ditto `tests/physics/car-driving.spec.ts`, `tests/ui/settings.spec.ts`
  (tab list test), `tests/ui/audio.spec.ts` (keyboard-driven).
- Docs: new `docs/input-deviations.md` section or extend `input-calibration-log.md`.

**Commit point R10** (this is the largest refactor — commit the module refactor with
foundation.spec green *before* building the settings UI if convenient; two commits are
fine).

---

## R11 — Controller menu navigation

### Design

Gamepad d-pad/left-stick moves DOM focus through the visible menu; South (A) activates;
East (B) triggers the screen's back action. Fixed mapping (not rebindable — console
convention). Implementation must respect the one-RAF rule: the input module already
polls the pad every browser frame; we surface *menu nav edges* from it and let a
Vue-side navigator move focus.

### Changes

1. `InputControlsModule` — new method `sampleMenuNavigation(): MenuNavigationFrame`:

```ts
export interface MenuNavigationFrame {
  up: boolean; down: boolean; left: boolean; right: boolean;   // HELD states (dpad OR left stick past 0.5)
  confirmPressed: boolean; backPressed: boolean;               // edges (south/east), consume-once
}
```

   Edge detection for south/east reuses the existing previous-buttons array (they are
   *separate* from gameplay JUMP edges; while a menu is open `areControlsActive()` is
   false so no double-consumption conflict — but do NOT reuse the "JUMP" edge queue;
   track menu edges independently in `pollGamepad`).
2. `GameRuntime` — in the render-frame path (where `input.updateBrowserFrame` is
   called): if `matchState` ∈ MENU-family ∪ {PAUSED, MATCH_RESULTS, CAR_CUSTOMISE,
   TOURNAMENT_BRACKET, TOURNAMENT_VICTORY} (define one shared
   `MENU_NAVIGABLE_STATES` const in `MatchFlowTypes.ts` — R12/R13 extend it), emit a
   new typed event `runtime:menu-navigation` with the sampled frame
   (`EventTypes.ts` += `MenuNavigationEvent`).
3. New `src/ui/useMenuGamepadNavigation.ts` composable, used once in `App.vue`:
   - Subscribes to `runtime:menu-navigation`.
   - Focus targets: visible elements matching
     `[data-menu-root] :is(button, input[type=range], input[type=color]):not(:disabled)`
     in DOM order. Add `data-menu-root` to the root element of: MainMenu, MatchSetup,
     SettingsPanel, PauseMenu, ResultsScreen (+ CarCustomise, TournamentBracket,
     TournamentVictory in R12/R13). Only one menu root is ever visible at a time
     (App.vue v-if chain guarantees it).
   - Held-repeat: first move immediate, then 380 ms delay, then 140 ms repeat
     (timestamps via `performance.now()` carried in the composable).
   - up/down → previous/next target; left/right → if focused element is a range
     input: step it (dispatch `input` event with ±step — mirrors `setRangeSlider`
     in tests); else if inside a `.duration-row`/`.button-group`/`[role=group]`:
     move focus horizontally within the group; else fall through to prev/next.
   - confirm → `activeElement.click()`.
   - back → click the first visible `[data-menu-back]` (add the attribute: MatchSetup
     BACK, SettingsPanel BACK, PauseMenu RESUME, ResultsScreen RETURN TO MENU,
     CarCustomise BACK, bracket LEAVE buttons). MainMenu has none (B is a no-op).
   - When a menu root appears (watch `matchFlowStore.matchState`), focus the first
     target (or the element with `autofocus`).
   - Style: add explicit `.wo-item:focus, .duration-item:focus, .tab:focus, .chip:focus`
     outline styles in `retro-ui.css` (`outline: 2px solid var(--ui-amber); outline-offset: 2px`)
     — programmatic `.focus()` does not always trigger `:focus-visible`.

### Gates

**New Playwright `tests/ui/controller-navigation.spec.ts`** (runtime RAF stays live;
virtual gamepad via `__INPUT_TEST__`):
1. Main menu: connect pad; press dpad-down (set state → clear) → `document.activeElement`
   is SETTINGS; dpad-up → PLAY; press south → MATCH_SETUP opens.
2. Match setup: dpad navigation reaches a duration chip; south on `duration-1` selects
   it (`getSessionState().selectedDurationMinutes === 1`); east → back at MAIN_MENU.
3. Pause menu: start match, pause via pad start button (existing binding), dpad-down
   ×2 → RETURN TO MENU focused, east → resumes (RESUME is `[data-menu-back]`).
4. Settings sliders: focus a camera slider via dpad, dpad-right 3× → slider value
   increased (assert via `getCameraSettings()`).
5. Mouse still works everywhere (click PLAY with pointer after pad use — existing
   suites cover this implicitly; assert once).
- Existing `tests/input/foundation.spec.ts` gamepad tests unmodified & green
  (menu-nav edges must not consume gameplay JUMP edges — regression-guarded by the
  "Right mouse button produces a jump press edge exactly once" and virtual-pad tests).

**Commit point R11.**

---

## R12 — Customise Car menu

### R12.1 State plumbing

- `MatchState` += `"CAR_CUSTOMISE"`. Add to: `MENU_STATES`
  (`MatchFlowController`), `MENU_MATCH_STATES` (`GameRuntime`), camera's menu list
  (see below), `App.vue` `showGameplayHud` exclusion list, `MENU_NAVIGABLE_STATES`.
- `MatchFlowController`: `openCarCustomise()` (from MAIN_MENU only) — mirrors
  `openSettings()`; `openMainMenu()` already returns. Test API
  (`BrowserGameFlowTestApi`): `openCarCustomise()`.
- `MainMenu.vue`: items become 01 PLAY, 02 TOURNAMENT (R13 — add the button here but
  wire in R13; if implementing R12 first, add CUSTOMISE as 02 and renumber in R13),
  03 CUSTOMISE CAR, 04 SETTINGS (`data-index` renumbering only — release-gate's
  `getByText("PLAY")` remains unambiguous: no other visible item contains "PLAY").

### R12.2 Settings + application path

- `settingsStore` new section `car: { bodyColor: string; boostColor: string }`,
  defaults `#4ff0ff` both; validation: `/^#[0-9a-f]{6}$/i` else default.
- `AssetPipeline`: `setPlayerCarColorOverride(hex: string | null)` — when set,
  `createCarVisual("player")` uses a derived profile:
  `{ teamId: "player", primary: hex, secondary: darkenHex(hex, 0.45), emissive: hex, patternId: "chevron-a" }`
  (`darkenHex` helper — multiply RGB by 0.55; unit-tested). Also apply to the
  procedural fallback path (`createProceduralCarFallback` takes context+team — check
  its signature and thread an optional override colour; if it only takes `team`,
  extend it with an optional `TeamVisualProfile` param).
- `PhysicsRenderBinding`: `rebuildCarVisual(carId)` — remove the cached visual from
  the root + map; the existing per-frame sync lazily recreates it via
  `assets.createCarVisual` (verify the creation loop runs for existing cars — it does:
  `let visual = this.carVisuals.get(carId); if (!visual) { … }`).
- `VfxModule`: `setPlayerBoostColor(hex: string | null)`; `teamColor("player")`
  returns the override when set (boost-trail spawn path only — goal celebration
  keeps team colours: read the call sites, the celebration one uses `scoringTeam`
  colour and must **not** use the override; guard by call site, i.e. a separate
  `boostTrailColor(carId)` helper).
- `GameRuntime` facade: `setPlayerCarColors({ bodyColor, boostColor })` → assets
  override + `physicsRenderBinding.rebuildCarVisual(PLAYER_CAR_ID)` +
  `vfx.setPlayerBoostColor`; `getPlayerCarColors()` for tests. Boot wiring in
  `GameCanvas.vue` from settings.

### R12.3 Camera framing

`ChaseCameraController`: handle `CAR_CUSTOMISE` before the generic menu branch:

```ts
if (state === "CAR_CUSTOMISE") { this.updateCustomiseCamera(context); return; }
```

`updateCustomiseCamera`: slow orbit around the *live player car position* (menu spawn
`(0, 0.35, −24)`): radius 4.6, height 1.5, angular speed ~0.25 rad/s, `lookAt(carPos + (0, 0.6, 0))`.
Car stays stationary (menu physics idles; no inputs are live). Remove `CAR_CUSTOMISE`
from the camera's `MENU_MATCH_STATES` equivalent so the orbit branch wins.

### R12.4 `CarCustomise.vue` (new, `src/components/menu/`)

- Root `data-testid="car-customise"` + `data-menu-root`; left-side `.wo-panel` column
  (the car occupies the right of the screen via the orbit camera — panel must not
  cover centre-right).
- BODY COLOUR: 8 preset swatch buttons (curated: cyan default, magenta, amber, lime,
  orange, white, red, violet — each `data-testid="body-swatch-<n>"`) + native
  `<input type="color" data-testid="body-color-input">`. On input/click:
  `settingsStore.update({ car: { bodyColor } })` + `runtime.setPlayerCarColors(…)` —
  **instant preview** via the rebuild path.
- BOOST COLOUR: same pattern (`boost-swatch-<n>`, `boost-color-input`).
- Boost preview "in action": `VfxModule.setBoostPreview(carId | null)` — while set,
  `updateRenderFrame` spawns the boost-trail burst every ~3rd frame at the car's rear
  using the boost colour (bypasses boost-consumption detection). CarCustomise mounts →
  `runtime.setBoostPreviewEnabled(true)`; unmount → false. Car remains stationary —
  the trail streams behind the parked car.
- BACK button (`data-menu-back`) → `runtime.playUiSound("cancel"); runtime.openCarCustomise… → openMainMenu()`.
- Styling: follow MatchSetup's wo- conventions (labels, chips, panel).

### Gates

- **Unit `tests/unit/carColorOverride.spec.ts`**: `darkenHex` math; settings hex
  validation (bad values → default); `AssetPipeline.setPlayerCarColorOverride` +
  `createCarVisual("player")` → traverse materials, team-primary material colour ===
  override (use the GLB-less fallback path in node: force fallback via a scratch
  pipeline or test the profile-derivation function directly — prefer exporting and
  unit-testing `derivePlayerProfile(hex)`).
- **Playwright `tests/ui/car-customise.spec.ts`**:
  1. Main menu shows CUSTOMISE CAR; click → `matchState === "CAR_CUSTOMISE"`, panel
     visible, camera diagnostics position within 6 m of the player car (orbit active).
  2. Set body colour `#ff8800` via the colour input (fill + dispatch `input`) →
     `runtime.getPlayerCarColors().bodyColor === "#ff8800"` and the live scene's
     player car primary material colour matches (new asset-test hook
     `getPlayerCarPrimaryColorHex()` traversing the live visual — add to
     `BrowserAssetTestApi` via AssetPipeline or the render binding).
  3. Boost preview: `getVfxActiveParticleCount() > 0` while on the screen with the
     runtime RAF live; leave → decays to 0 within 2 s.
  4. Persistence: reload → body colour still `#ff8800` (chip/input value + scene).
  5. BACK returns to MAIN_MENU; gameplay smoke: start a match, boost with LMB, no
     console errors (custom boost colour path).
- Existing suites: `car-visual.spec.ts` (opponent untinted, still magenta),
  `release-gate` (PLAY flow untouched), full match-flow suite.

**Commit point R12.**

---

## R13 — Tournament mode

### R13.1 States & data

- `MatchState` += `"TOURNAMENT_BRACKET"`, `"TOURNAMENT_VICTORY"`. Add both to
  `MENU_STATES`, `MENU_MATCH_STATES`, camera menu list (orbit camera is fine),
  `showGameplayHud` exclusions, `MENU_NAVIGABLE_STATES`.
- New `src/game-flow/TournamentController.ts`:

```ts
export interface TournamentRound { readonly opponentName: string; readonly difficulty: AiDifficulty; }
export const TOURNAMENT_ROUNDS: readonly TournamentRound[] = [
  { opponentName: "ROOKIE ROVERS", difficulty: "easy"   },
  { opponentName: "PRO PATROL",    difficulty: "medium" },
  { opponentName: "ALL-STAR ARSENAL", difficulty: "hard" },
  { opponentName: "LEGEND LYNX",   difficulty: "legend" }   // the final
];
export interface TournamentPublicState {
  readonly active: boolean;
  readonly phase: "setup" | "bracket" | "in-match" | "eliminated" | "champion";
  readonly currentRound: number;              // 0..3
  readonly durationMinutes: MatchDurationMinutes;
  readonly results: readonly ("win" | "loss" | null)[];  // length 4
  readonly rounds: readonly TournamentRound[];
}
```

  Methods: `enter()` (phase setup), `begin(duration)` (phase bracket, round 0),
  `startNextMatch()` (phase in-match; returns the round config),
  `recordMatchResult(winner: TeamId | null)` — win → results[round]="win"; if round 3 →
  phase champion else round+1, phase bracket; loss/null → results[round]="loss",
  phase eliminated; `leave()` → inactive reset. Pure state machine, no engine deps —
  fully unit-testable.
- Ownership/wiring in `GameRuntime`:
  - Instantiate alongside gameFlow; facade methods `enterTournament()`,
    `beginTournament(minutes)`, `playNextTournamentMatch()`,
    `continueTournament()` (from results → bracket/victory routing),
    `leaveTournament()`, `getTournamentState()`.
  - `enterTournament()`: `tournament.enter()` + `gameFlow.openTournamentBracket()`
    (new controller method, legal from MAIN_MENU and MATCH_RESULTS).
  - `playNextTournamentMatch()`: `selectAiDifficulty(round.difficulty)`;
    `gameFlow.selectMatchDuration(t.durationMinutes)`; `gameFlow.startMatch()`;
    tournament phase in-match. **Save + restore** the pre-tournament AI difficulty
    and selected duration when the tournament ends/leaves.
  - Match end detection: in the existing fixed-tick session sync, when tournament
    `phase === "in-match"` and `matchState` transitions to `MATCH_RESULTS`, call
    `tournament.recordMatchResult(session.winner)` exactly once (edge-detect on the
    transition; overtime guarantees `winner !== null` in practice, but treat null as
    a loss defensively).
  - `continueTournament()`: phase champion → `gameFlow.openTournamentVictory()`;
    bracket/eliminated → `gameFlow.openTournamentBracket()`.
  - `leaveTournament()`: `tournament.leave()` + restore difficulty/duration +
    `gameFlow.returnToMenu()`.
- Store mirror: extend `SessionStateChangedEvent` with
  `tournament: TournamentPublicState` (always present; inactive default), new
  `src/stores/tournamentStore.ts` mirroring it (same pattern as matchFlowStore),
  `App.vue` subscription updated. Session-only (no localStorage) — refresh abandons
  the tournament; document as a decision.

### R13.2 UI

- `MainMenu.vue`: 02 TOURNAMENT (`data-testid="open-tournament"`) →
  `runtime.enterTournament()`.
- New `src/components/menu/TournamentBracket.vue` (`data-testid="tournament-bracket"`,
  `data-menu-root`), shown when `matchState === "TOURNAMENT_BRACKET"`:
  - **setup phase**: wo-title "TOURNAMENT", duration chips 1/3/10
    (`tournament-duration-<n>`), BEGIN TOURNAMENT (`data-testid="tournament-begin"`),
    BACK (`data-menu-back`, → `leaveTournament()`).
  - **bracket phase**: 4-slat ladder — per round: round label (ROUND 1/2, SEMI-FINAL,
    FINAL), opponent name, state marker: ✓ won (cyan), current ► (amber pulse),
    upcoming (dim). `data-testid="bracket-round-<n>"` with `data-state="won|current|upcoming"`.
    Buttons: PLAY NEXT GAME (`tournament-play-next`) → `playNextTournamentMatch()`;
    LEAVE TOURNAMENT (`tournament-leave`, `data-menu-back`).
  - **eliminated phase**: magenta wo-title "ELIMINATED", ladder shows the loss (✗),
    RETURN TO MENU (`tournament-return`, `data-menu-back`) → `leaveTournament()`.
- New `src/components/menu/TournamentVictory.vue` (`data-testid="tournament-victory"`),
  when `matchState === "TOURNAMENT_VICTORY"`: full polish — huge cyan `.wo-title`
  "CHAMPION", subtitle "TOURNAMENT WON", the 4 defeated opponents listed with ✓,
  slow CSS shimmer/sparkle (pure CSS, respects reducedFlashes), RETURN TO MENU
  (`data-menu-back`) → `leaveTournament()`. Trigger the existing goal-celebration VFX
  once on mount via a runtime hook if trivially available; otherwise CSS-only (do not
  add engine coupling for this).
- `ResultsScreen.vue`: when `tournamentStore.state.active && phase === "in-match"`
  … (phase will still be in-match until CONTINUE) — condition on `active`: replace
  REPLAY/RETURN buttons with CONTINUE (`data-testid="tournament-continue"`) →
  `runtime.continueTournament()` and LEAVE TOURNAMENT → `runtime.leaveTournament()`.
  Non-tournament rendering unchanged (existing tests must pass untouched).
- `App.vue`: mount the two new components in the v-if chain.

### Gates

- **Unit `tests/unit/tournament.spec.ts`** (pure controller): full walkthrough
  4 wins → champion with results `["win","win","win","win"]`; loss at round 1 →
  eliminated, later rounds null; difficulty sequence easy/medium/hard/legend;
  duration propagation; `leave()` resets; `recordMatchResult` idempotence (second
  call same round ignored); null winner → loss.
- **Unit** (GameRuntime-level, in the existing runtime unit-test style if present —
  otherwise cover via Playwright only): difficulty saved/restored around a tournament.
- **Playwright `tests/game-flow/tournament.spec.ts`** (use the deterministic
  fast-forward patterns from `match-flow.spec.ts`: park opponent at (40,1,40),
  `simulateGoal("player")`, `advanceGameSeconds` with ball re-parking loop):
  1. Menu → TOURNAMENT → bracket setup visible; pick 1 MIN → BEGIN → bracket phase,
     round-0 slat `data-state="current"`, opponent "ROOKIE ROVERS".
  2. PLAY NEXT GAME → countdown → PLAYING; `runtime.getAiDifficulty() === "easy"`;
     duration 1 min (`getSessionState().selectedDurationMinutes === 1`).
  3. Win it (simulateGoal + fast-forward to MATCH_RESULTS) → results screen shows
     CONTINUE + LEAVE (and NOT replay); CONTINUE → bracket, round 0 ✓ won, round 1
     current, `getAiDifficulty()` will be "medium" on next play.
  4. Loop wins through all 4 → after final CONTINUE → `tournament-victory` visible,
     legend was the final difficulty; RETURN TO MENU → MAIN_MENU, difficulty restored
     to pre-tournament value.
  5. Elimination path (fresh test): lose game 1 (`simulateGoal("opponent")` + fast
     forward) → CONTINUE → bracket ELIMINATED state → RETURN TO MENU.
  6. LEAVE TOURNAMENT mid-bracket returns to menu and a subsequent normal PLAY match
     works (state fully reset).
- Existing: full `match-flow.spec.ts` + `release-gate` untouched and green.
- Docs: `build-decisions.md` (tournament design, session-only persistence),
  `implementation-progress.md`.

**Commit point R13.**

---

## R14 — Final integration pass

1. `npx vue-tsc --noEmit`, `npx vitest run`, `npm run validate` — all green.
2. Full Playwright, both projects (expect only the 2 documented release-gate
   artifacts vs the test-mode build); `npm run test:release` fully green.
3. **Screenshot QA** (throwaway spec, not committed): main menu (single ball, visible
   ramps + brighter hex/ribs), match setup (LEGEND chip), customise screen (car
   close-up + boost preview + colour change), mid-match at a **corner** (ramp visible,
   car mid-climb), goal-side ramp close-up, goal moment (blast + quick chat visible),
   bracket (all phases), victory screen. Eyeball each against this plan; fix obvious
   misses and re-run affected suites.
4. Manual feel checklist via a scripted Playwright run (real inputs): drive up each
   wall and *around* each corner; flip with camera steady; get auto-flipped from a
   side-stuck pose; rebind a key and use it; navigate every menu with the virtual pad.
5. Docs sweep: every workstream's deviations entries done;
   `implementation-progress.md` gets a "Ramps & Features pass (R1–R14)" section;
   `build-decisions.md` one summary entry.
6. Final commit + push.

---

## Appendix A — New/changed constants

| Location | Key | Value |
|---|---|---|
| ArenaRampGeometry | RAMP_FILLET_RADIUS / SEGMENTS / SEG_HALF_THICK | 2.0 / 5 / 0.12 (unchanged semantics) |
| ArenaRampGeometry | CORNER_RADIUS / CORNER_PANELS / PANEL_HALF_THICK | 6.0 / 6 / 0.5 |
| StadiumGeometryFactory | glass v2: emissiveIntensity / opacity | 0.85 / 0.28 |
| StadiumGeometryFactory | ribs v2: width / depth / spacing / color / emissive | 0.22 / 0.4 / 6 / 0x39414f / 0x18222e @ 0.6 |
| PhysicsFacade | AUTO_FLIP: upY / speed / angSpeed / height / seconds | 0.55 / 6.0 / 4.0 / 1.2 / 0.75 |
| PsxRenderSettings | authentic / balanced / clean res | 480×270 / 640×360 / 960×540 |
| settingsStore | graphics.preset default | "clean" |
| MatchFlowController | GOAL_BLAST_RADIUS / MAX_DELTA_V | 16 / 18 |
| AiDifficulty | LEGEND_AI | table in R9 |
| Input | airRollSensitivity default / range | 1.0 / 0.5–2.0 |
| QuickChat | stagger / lifetime | 300 ms / 3000 ms |

## Appendix B — Test inventory

New files: `arenaRampGeometry.spec.ts`, `stadiumVisuals.spec.ts`,
`cameraFlipYaw.spec.ts`, `goalBlast.spec.ts`, `controlBindings.spec.ts`,
`carColorOverride.spec.ts`, `tournament.spec.ts` (unit);
`arena-ramps.spec.ts`, `quick-chat.spec.ts`, `rebinding.spec.ts`,
`controller-navigation.spec.ts`, `car-customise.spec.ts`, `tournament.spec.ts`
(Playwright).

Modified: `wallDriving.spec.ts` (+3 wall climbs, corner, ray sweep),
`autoFlip.spec.ts` (rewritten v2), `psxVisualLanguage.spec.ts`,
`psx-pipeline.spec.ts`, `settings.spec.ts` (res + controls tab),
`aiDifficulty.spec.ts` + `ai-difficulty.spec.ts` (legend),
`arena-shell.spec.ts` (≥30 transparent), `match-flow.spec.ts` (+goal blast),
`SettingsPanel`-related suites as listed per workstream.

Must remain untouched and green: `tests/input/foundation.spec.ts` (bindings-refactor
anchor), left-wall climb in `wallDriving.spec.ts` (fillet tuning anchor),
`release-gate.spec.ts` flows, kickoff/AI determinism suites.
