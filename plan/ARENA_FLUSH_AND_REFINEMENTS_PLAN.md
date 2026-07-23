# Arena Flush & Refinements Plan (F1–F15)

One-shot implementation plan for the post-R14 bug/feature batch. Every root
cause below was verified against the current code (and several confirmed
empirically with probe scripts) during planning — the "Root cause" sections
state facts, not hypotheses, unless explicitly marked "verify first".

**Read this section before starting.**

## 0. Global rules

### 0.1 Environment quirks (all previously hit in this repo — do not rediscover them)

- Playwright chromium: `export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (verify with `find /opt/pw-browsers -iname chrome -type f` if missing).
- `playwright.config.ts` declares BOTH webServers; even a single-project run
  waits for dev (5173) and preview (4173). Start what's missing:
  - dev: `setsid nohup npx vite --port 5173 > /tmp/vite-dev.log 2>&1 < /dev/null & disown`
  - preview: `rm -rf dist && PLAYWRIGHT_TEST=1 npx vite build && setsid nohup npx vite preview --port 4173 > /tmp/vite-preview.log 2>&1 < /dev/null & disown`
- `chromium-preview` runs need a **fresh** `PLAYWRIGHT_TEST=1` build after
  source changes. `npm run test:release` builds its own plain build; the
  release-gate "no debug hooks" test only passes against that plain build.
- Full-suite Playwright runs flake under parallel load (`tests/ai/*`, the
  audio engine-hum test have all timed out spuriously before). Any full-suite
  failure must be re-run in isolation before being treated as a regression.
- Constructing **two `AssetPipeline` instances in one vitest file hangs
  `initialise()` forever**. One pipeline per test file, or assert several
  facts from a single instance (see `tests/unit/menuGhostBall.spec.ts`).
- This environment has silently reset the working tree to a stale commit
  multiple times across sessions. **Commit + push as soon as a workstream
  typechecks and its own tests pass**, before long verification runs.

### 0.2 Commit discipline

One commit per workstream (two for the big ones, split source+unit / e2e+docs,
as R10–R13 did). Branch: `claude/master-build-brief-u8agzk`. Commit messages:
imperative summary + 2–4 sentence body, trailer
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (no Claude-Session
line). Push with `git push -u origin claude/master-build-brief-u8agzk`,
retrying on network failure with 2s/4s/8s/16s backoff. Never force-push.

### 0.3 Test-first discipline

For every workstream whose gate is a behavioural assertion (not a count
update): write the failing test FIRST, run it, confirm it fails **for the
stated root-cause reason**, then implement, then confirm green, then run the
full `npx vitest run` + targeted Playwright before committing. Where this plan
gives numeric thresholds, treat them as starting points: measure the real
value first, then pin the threshold with comfortable margin (the established
pattern — see `docs/physics-deviations.md` R1/R3 sections).

### 0.4 Verification loop per workstream

`npx vue-tsc --noEmit` → new/updated unit tests → full `npx vitest run` →
targeted Playwright (`--project=chromium-dev`, then `chromium-preview` after a
fresh test-mode build) → commit+push → docs entry (can batch docs into the
workstream's commit).

### 0.5 Locked user decisions (do not re-ask)

- Boost pads: remove small pads at (0,−7), (0,7), (−14,−20), (14,−20),
  (−14,20), (14,20). Remaining: small at (±14,±7) and (0,±20) + the 4 full
  corner pads. 10 pads total.
- Aerial pitch: W / stick-forward = **nose DOWN** (RL convention), S = nose up.
- Ball-cam HUD indicator: **always visible** — dimmed when off, lit when on.
- Goal blast: radius **26**, max Δv **30**, falloff floor **0.4** inside the
  radius (hard zero outside).

---

## F1 — Flush floor→wall ramps (THE priority fix)

### Root cause (verified numerically)

`filletRun()` in `src/physics/arena/ArenaRampGeometry.ts` places segment box
**centres** on a circle of radius `R − t` (1.88) about the arc centre
`(u=R, v=R)`. The slab's **outer/back face** (radius `R`) is what ends up
tangent to floor and wall — but cars drive on (and players see) the **inner
concave face**, at radius `R − 2t = 1.76`. The entire drivable arc floats
`2t = 0.24 m` inside the ideal quarter-pipe:

- Bottom seam: the first segment's drivable-face leading edge hangs at
  `y ≈ 0.203`, `u ≈ 2.097` from the wall — a visible ~0.2 m step/lip where
  the ramp should blend into the floor.
- Top seam: the surface stops `0.24 m` short of the wall plane — a matching
  ledge at the wall transition.

The R1 anchor-regression test (`tests/unit/arenaRampGeometry.spec.ts`)
**enshrines these wrong values** (it pinned the legacy collider layout, which
had the same off-by-`2t` placement), so it preserved the bug.

### Change (`src/physics/arena/ArenaRampGeometry.ts`, `filletRun`)

Place centres on radius `R + t` so the **inner face** lands exactly on the
tangent circle of radius `R`:

```ts
const inset = R - (R + t) * Math.sin(theta);
const y = R - (R + t) * Math.cos(theta);
```

Nothing else in `filletRun` changes. Consequences (all desirable, verify in
tests, don't "fix" them):

- Segment 0's box centre sits slightly **below** the floor
  (`y = 2 − 2.12·cos9° ≈ −0.094`); its drivable face midpoint is at
  `+0.025` and its leading face edge dips to ≈ `−0.034` — i.e. the surface
  emerges from the floor seamlessly, buried edge invisible.
- The top segment's up-slope face edge passes slightly beyond vertical into
  the wall — flush at the wall seam too.
- Slab back-halves bury into floor/wall colliders. Overlapping static
  colliders are harmless in Rapier; visually the buried parts are hidden.

Because physics and visuals share this generator, one change fixes both.

### Test gates

1. **Rewrite the anchor test** (it currently pins the bug). New expected
   values for the right-wall (`inward = (−1,0,0)`) segment 0, `theta = 9°`,
   `R = 2, t = 0.12`:
   - `inset = 2 − 2.12·sin(9°) ≈ 1.66837` → `translation.x ≈ 18.33163`
   - `translation.y = 2 − 2.12·cos(9°) ≈ −0.09389`
   Compute in-test from the closed formula rather than hardcoding decimals,
   and add a comment explaining the R−t → R+t correction (the old anchor
   preserved a 0.24 m surface gap — reference this plan).
2. **New flush-surface invariant test** (same file): for each of the six
   straight-wall runs' first segments, reconstruct the drivable face's
   down-slope edge midpoint from the spec
   (`translation + rotate(rotation, {x: ±chordHalf, y: +t, z: 0})` — pick the
   sign that lowers `y`) and assert `edge.y ∈ [−0.15, 0.05]` (flush or
   buried, never floating). Mirror assertion at the top: the last segment's
   up-slope face edge must be within `0.06` of its wall plane.
3. **New "no step at the base" physics test** (`tests/unit/wallDriving.spec.ts`):
   drive a car from midfield into the right-wall ramp at moderate throttle
   (no boost), record per-tick `|Δlinvel|` while `position.x` crosses the
   `[halfWidth − 3, halfWidth − 1]` band. First run this against the OLD code
   to observe the lip's impulse spike, then assert the new max is below a
   pinned threshold (expect ≲ half the old spike; pin with margin).
4. Existing `wallDriving.spec.ts` climb tests (left/right/near/far) and the
   corner-smoothness test must stay green with **unchanged thresholds**.
5. `tests/unit/arenaRampGeometry.spec.ts`'s bijection/coverage/count tests
   stay green (counts unchanged: 150 fillet + 24 corner).
6. Playwright `tests/visual-language/arena-ramps.spec.ts` unchanged & green.
7. Docs: append a correction note to `docs/physics-deviations.md`'s R1
   section (the "anchor regression" preserved the legacy 0.24 m lip; fixed
   here) — do not rewrite history, add a dated addendum.

**Commit point F1** (may be combined with F2 — same files/tests).

---

## F2 — Corner wall panels flush with the straight walls

### Root cause (verified numerically)

`generateCorner()` places each corner panel's **centre** on the chord
(`chordDistance = Rc·cos(δ/2) ≈ 5.9487`, `δ = 15°`), half-thickness 0.5 → the
panel's inner face sits at radius **5.4487** while the straight walls are
tangent to the arc at radius **6**. Every corner panel therefore protrudes
**≈ 0.55 m into the field**, and a car sliding along a straight wall slams
into a ≈ 0.49 m step at the corner junction instead of gliding around.

### Change (`src/physics/arena/ArenaRampGeometry.ts`, `generateCorner`)

Switch from inscribed (chord) to **circumscribed (tangent)** placement:

```ts
const panelCentreDistance = Rc + CORNER_PANEL_HALF_THICK;   // inner face tangent at radius Rc
const chordHalf = Rc * Math.tan(delta / 2) + 0.05;          // ≈ 0.840 — tangent faces meet/overlap
```

- `panelCentre = arcCentre + outward · panelCentreDistance`. Inner face now
  touches the ideal arc at each panel's midpoint and **never** crosses into
  the field; at panel edges the surface recedes outward to radius
  `Rc/cos(7.5°) ≈ 6.052` (≤ 5 cm shallow grooves — matches how flat panels
  approximate a curve everywhere else in this arena).
- At the arc endpoints the tangent face meets the straight wall plane
  **exactly** (both tangent to the same circle) — the first/last faces extend
  ~0.4 m past that intersection *into* the straight wall's collider. That is
  harmless buried overlap, NOT a protrusion; leave it.
- Corner **fillet runs**: their `wallBase` must move to the tangent point:
  `filletRun(arcCentre + outward·Rc, inward, chordHalf + 0.1)` — i.e. base
  the ramp on the panel's *inner face*, not the old chord centre.

### Test gates

1. **No-protrusion invariant** (`arenaRampGeometry.spec.ts`): for every
   `corner-wall` spec, compute both inner-face bottom corners
   (`translation + rotate(rotation, {x: ±halfExtents.x, y: −halfExtents.y, z: −CORNER_PANEL_HALF_THICK})`)
   and assert their horizontal distance from that corner's arc centre is
   `≥ Rc − 1e−6`. (This is the test that fails loudly on today's code:
   current inner faces sit at ≈ 5.45.)
2. **Junction continuity**: the corner panel nearest each straight wall must
   present no step: assert the tangent-plane distance of its inner face from
   the adjacent wall plane is ≤ 0.001 at the tangency angle (derive from
   spec rotation/translation, or assert the geometric identity
   `panelCentreDistance·cos(alphaMid) − CORNER_PANEL_HALF_THICK·cos(alphaMid) ...` —
   simplest robust form: sample the inner-face point at the wall-side edge
   and assert its `|x|` (or `|z|`) is `≥ halfWidth − 0.06`).
3. **Drive-around-the-corner physics test** (`wallDriving.spec.ts`): spawn a
   car on the right wall run heading toward a corner (position
   `(halfWidth − 1.2, 0.4, 10)`, facing +z, throttle 1 with gentle steer
   toward the wall), step ~400 ticks; assert (a) the car's speed never drops
   below 40 % of its pre-corner speed in a single 30-tick window (the crash
   the user reports), and (b) max per-tick `|Δlinvel|` under a pinned
   threshold. Measure on old code first to demonstrate the crash spike.
4. Existing corner-smoothness + `aiUnstuck.spec.ts` green.
5. The bijection test in `arenaRampGeometry.spec.ts` still passes untouched
   (it compares generator output to meshes — both move together). Counts
   unchanged (24 panels, 150 fillets).
6. Docs: `docs/physics-deviations.md` — new "F2 corner tangency" subsection
   (inscribed→circumscribed, why buried ends are intentional).

**Commit point F2** (or combined F1+F2 commit).

---

## F3 — One continuous hex shell: single layer, square hexes, 2× size, thicker lines

### Root causes (all verified in code)

1. **Double layers**: every shell surface — `SideWallLeft/Right` (BoxGeometry
   1 m thick), `Ceiling` (box), end-wall segments + lintel (boxes), goal-box
   shells (boxes), and `CornerWallPanel`s (boxes, 1 m thick) — uses the
   shared transparent `DoubleSide` glass material with `depthWrite: false`.
   A transparent double-sided box renders its pattern on BOTH parallel
   faces → two hex layers spaced 1 m apart on walls AND roof. Exactly the
   user's report.
2. **Stretched hexes**: one material with `hexTexture.repeat.set(10, 10)` is
   shared by every surface regardless of dimensions. Side wall face 48×20 →
   hex cells 4.8×2.0 world units (2.4:1 stretch); ceiling 42×60 → 4.2×6.0;
   corner panels ≈1.67×20 → 0.17×2.0 (12:1 stretch — why "the corners look
   different to the rest").
3. Hexes too small / lines too thin: `HexPatternTexture.ts` —
   `HEX_CIRCUMRADIUS = 48` px on a 512 px tile, `LINE_WIDTH = 2.5`. Also the
   tile is not seam-periodic (`colStep = 72` doesn't divide 512), which adds
   faint seam lines at tile borders.

### Changes

**A. `src/assets/procedural/HexPatternTexture.ts`** — make the tile periodic,
hexes proportionally larger in the tile, lines thicker:

```ts
const TEXTURE_SIZE = 512;
const COL_STEP = 64;                        // 8 columns; horizontal period 128 divides 512 exactly
const HEX_CIRCUMRADIUS = COL_STEP / 1.5;    // ≈ 42.667 — flat-top geometry keeps colStep = 1.5R
const ROW_STEP = TEXTURE_SIZE / 7;          // ≈ 73.14 vs ideal √3·R ≈ 73.9 → ~1 % vertical squash, invisible
const LINE_WIDTH = 4.0;                     // was 2.5 — "lines a bit thicker"
```

Rework `drawHexGrid` to iterate exact integer columns/rows from these
constants (`hexHeight = ROW_STEP` instead of `√3·R`) so the pattern tiles
seamlessly. Keep the two-pass primary/secondary overlay and the DataTexture
(node-safe) approach.

**B. `src/assets/procedural/StadiumGeometryFactory.ts`** — planes instead of
boxes for every glass surface, with per-surface square UVs:

- New module-level constant `HEX_TILE_WORLD_SIZE` and a helper:

```ts
/** World-units per full texture tile. 2R px of 512 → hex width = (2R/512)·S. S = 11.5 → ≈ 1.92 m hexes. */
const HEX_TILE_WORLD_SIZE = 11.5;

function createShellPlaneGeometry(registry, key, worldW, worldH) {
  return registry.getOrCreate(key, () => {
    const g = new THREE.PlaneGeometry(worldW, worldH);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * (worldW / HEX_TILE_WORLD_SIZE), uv.getY(i) * (worldH / HEX_TILE_WORLD_SIZE));
    }
    return g;
  });
}
```

- Glass material: `hexTexture.repeat.set(1, 1)` (UVs now carry the density);
  everything else about the material (emissive pair, opacity 0.28,
  DoubleSide, depthWrite false) unchanged. Bump registry key to
  `stadium-glass-shell-v3`.
- Replace geometries and positions (keep names, renderOrder, material):
  - `SideWallLeft/Right`: plane `(sideWallLength × interiorHeight)` rotated
    to face inward, positioned at `x = ∓fieldWidth/2` (the physics inner
    face), `y = interiorHeight/2`.
  - `Ceiling`: plane `(fieldWidth × fieldLength)` rotated flat, at
    `y = interiorHeight`.
  - End-wall side segments + lintel: planes at `z = ±fieldLength/2`.
  - Goal-box back/sides/roof: planes at the corresponding physics inner
    faces (back at `±(halfLength + goalDepth)`, sides at
    `±(goalWidth/2)`… mirror the current box centres minus half thickness
    toward the interior).
  - `CornerWallPanel`s in `createArenaRamps`: plane
    `(2·halfExtents.x × 2·halfExtents.y)` positioned at
    `spec.translation + rotate(spec.rotation, {x:0, y:0, z:−CORNER_PANEL_HALF_THICK})`
    with `spec.rotation` — i.e. exactly on the collider's inner face. Add a
    tiny exported helper in `ArenaRampGeometry.ts`
    (`cornerPanelInnerFaceOffset(): Vec3Like`) or compute inline; keep the
    "what you see is what you drive on" property intact.
- Do NOT convert the opaque `RampSegment` fillet boxes or `FloorBase` — only
  glass shell surfaces. Ribs unchanged.

### Test gates

1. `tests/unit/stadiumVisuals.spec.ts` — update + extend:
   - Material: `map === emissiveMap` still; `map.repeat` now `(1,1)`.
   - **Single-layer invariant**: every mesh named `SideWallLeft/Right`,
     `Ceiling`, `CornerWallPanel`, each `EndWall*` child, each
     `GoalBox*Shell` glass child has `geometry.type === "PlaneGeometry"`.
   - **Square-hex invariant**: for each of those meshes, read the geometry's
     UV span (`max−min` per axis) and its world dimensions; assert
     `uvSpanU / worldW ≈ uvSpanV / worldH` within 1 % AND
     `worldW / uvSpanU === HEX_TILE_WORLD_SIZE` within 1 % — square cells at
     a consistent world density on every surface including corners.
   - Hex texture constants: assert `LINE_WIDTH ≥ 4`, and periodicity:
     `TEXTURE_SIZE % (2·COL_STEP) === 0`.
2. `tests/unit/arenaRampGeometry.spec.ts` bijection test: update the
   corner-panel branch to expect the inner-face offset position (fillet
   segments unchanged).
3. `getStadiumShellInfo` (`AssetPipeline`) still counts ≥ 30 transparent
   meshes / 24 `CornerWallPanel`s — planes keep names + transparency; run
   `tests/visual-language/arena-shell.spec.ts` + `arena-ramps.spec.ts`
   unchanged.
4. Screenshot QA (final workstream): menu wide shot — one hex layer on wall
   and roof, hexes visibly square-ish and larger, corners continuous with
   walls.
5. Docs: `docs/visual-language-deviations.md` — "F3 single-layer shell"
   section (boxes→planes rationale, UV-per-geometry design, texture
   periodicity constants).

**Commit point F3.**

---

## F4 — Holding accelerate through "GO" must launch instantly

### Root cause (verified in code)

`GameRuntime.applyMenuNavigationGates()` calls
`input.rearmGameplayInputs()` on **every** `areControlsActive()` false→true
transition. That includes `COUNTDOWN_GO → PLAYING`: a W held through the
countdown is captured into the require-release mask and **suppressed until
the player releases and re-presses it** — the exact reported symptom. The
mask exists solely to stop a held gamepad-South from jumping the car when
closing the pause menu (R11); it must not fire on countdown transitions.

### Change (`src/core/GameRuntime.ts`)

Track the match state the transition came *from* and only re-arm when it was
menu-navigable:

```ts
private previousMatchStateForGates: MatchState = "BOOT";

private applyMenuNavigationGates(): void {
  ...
  const cameFromMenuNavigable = MENU_NAVIGABLE_STATES.includes(this.previousMatchStateForGates);
  if (controlsActive && !this.previousControlsActive && cameFromMenuNavigable) {
    modules.input.rearmGameplayInputs();
    modules.input.clearPendingEdges();
  }
  this.previousControlsActive = controlsActive;
  this.previousMatchStateForGates = matchState;
}
```

`COUNTDOWN_GO` is not in `MENU_NAVIGABLE_STATES` → no mask at kickoff.
`PAUSED` is → resume still masks. Edges pressed during the countdown never
enqueue anyway (`gameplayEdgesEnabled === false` there), so dropping the
unconditional `clearPendingEdges()` is safe.

### Test gates

1. **New Playwright test** (`tests/input/kickoff-throttle.spec.ts`, live RAF —
   do NOT pause the runtime; this bug lives in the frame path):
   `page.keyboard.down("KeyW")` while `matchState` is a countdown state, poll
   to `PLAYING`, then within ~0.75 s (poll) assert
   `getCarState("car-player")` horizontal speed `> 2` **without ever
   releasing W**. Run against current code first — it must fail (speed stays
   ≈ 0) to prove the root cause.
   Also assert steering works: hold `KeyA` too and check `|angvel.y| > 0.1`.
2. **Anti-regression** (the reason the mask exists): all of
   `tests/ui/controller-navigation.spec.ts` — especially "no jump on resume
   while South is held" and "south taps while paused never leak" — green
   unmodified.
3. `tests/input/foundation.spec.ts` green unmodified.
4. Docs: `docs/input-calibration-log.md` — F4 note under the R11 section
   (the re-arm scope was too broad; now menu-navigable-origin only).

**Commit point F4.**

---

## F5 — Aerial pitch: responsive and the right way round

### Root causes (both verified empirically this session)

Probe: airborne car, `pitch = 1` held 1.0 s → angular velocity reached only
**0.537 rad/s** and the nose tilted **UP** (`forward.y = +0.27`).

1. **~23× too weak**: `applyAerialRotation` computes a desired angular
   *acceleration* and applies `applyTorqueImpulse(accel · dt)`. Rapier
   divides a torque impulse by the body's moment of inertia (large for a
   180 kg car box), so the achieved `Δω` is `accel·dt / I` — the RL-accurate
   constants (12.46 rad/s² pitch, cap 5.5 rad/s, already in
   `PhysicsConstants.ts`) are being silently divided by ~23.
2. **Backwards**: `pitch = +1` (the "pitchNoseDown" input, W in air) produces
   **+local-X** angular velocity, which pitches the nose UP. The game's own
   `DodgeController` flips *forward* about **−X** for the same input — the
   two disagree; free-air tilt is inverted relative to both RL and this
   game's dodges. (Yaw and roll signs are suspect for the same reason —
   nobody noticed because aerial control was ~23× too weak to matter.
   **Verify all three axes empirically via the direction tests below; do
   not trust sign derivations on paper.**)

### Change (`src/physics/car/AerialController.ts`)

Replace torque-impulse integration with direct velocity-space integration
(the same approach `DodgeController` uses, and how Rocket League itself
works — angular response independent of mass/inertia):

```ts
export function applyAerialRotation(car: CarEntity, parameters: PhysicsParameters, dt: number): void {
  const rotation = car.body.rotation();
  const inverseRotation = { x: -rotation.x, y: -rotation.y, z: -rotation.z, w: rotation.w };
  const local = V.applyQuaternion(car.body.angvel(), inverseRotation);

  // Sign convention (matches DodgeController + RL): pitch +1 = nose DOWN,
  // yaw +1 = nose RIGHT, roll +1 = roll RIGHT. With LOCAL_FORWARD = (0,0,-1)
  // these all map to NEGATIVE local-axis rates — verified by the direction
  // tests in aerialControl.spec.ts, which are the authority if this comment
  // and reality ever disagree.
  const pitchRate = local.x + computeAxisAcceleration(-input.pitch, local.x, ...) * dt;
  // ... same shape for yaw (y) and roll (z), roll keeping the
  // airRollSensitivity multiplier on its max acceleration.

  const world = V.applyQuaternion({ x: pitchRate, y: yawRate, z: rollRate }, rotation);
  car.body.setAngvel(world, true);
  clampAngularSpeed(car);
}
```

Implementation notes:

- Keep `computeAxisAcceleration` (input accel + damping) exactly as-is; only
  the integration target changes (rate += accel·dt, then `setAngvel`).
- Negate the INPUT going into each axis (or the resulting rate — pick one,
  apply consistently to all three axes), then let the direction tests decide
  the final signs empirically. Expectation: all three need negating, but the
  tests are the authority.
- Retune `PhysicsParameters.aerial` damping toward RL's published values:
  `pitchDamping: 2.8, yawDamping: 3.2, rollDamping: 4.95` (from 2/2/3),
  `dampingInputReduction: 0.65` unchanged. With full input, effective pitch
  damping ≈ 0.98 → cap-limited response, ~0.47 s to reach the 5.5 rad/s cap.
- Check `src/ai/…computeAerialPursuitInput` (grep it): it produces pitch/yaw
  inputs under the OLD sign convention. After the flip, its signs likely
  need inverting too — gate: the AI aerial unit test
  (`aiDifficulty.spec.ts` "hard-only limited aerial") plus a new assertion
  that during aerial pursuit the car's nose actually converges toward the
  ball (angle between forward and to-ball decreasing over 30 ticks), not
  just "finite inputs".
- `DodgeController` is untouched: during an active dodge it `setAngvel`s
  every tick and overwrites the aerial contribution. But the **recovery**
  phase and **flip-cancel** now have ~23× stronger pitch authority — the
  `dodgeFlip.spec.ts` flip-cancel test's `< 220°` cumulative-rotation bound
  may shift; re-measure and adjust that threshold if needed with a comment.

### Test gates (new `tests/unit/aerialControl.spec.ts`)

Write these FIRST; on current code #1 fails on direction and #2 fails on
magnitude — confirming both root causes:

1. **Direction, all three axes** (airborne car at y=10, zero velocities;
   capture initial `right0 = rotate(rotation, (1,0,0))` and
   `up0 = rotate(rotation, (0,1,0))`):
   - `pitch=+1`, 30 ticks → `forward.y < −0.1` (nose DOWN); `pitch=−1` → `> 0.1`.
   - `yaw=+1`, 30 ticks → `dot(forward, right0) > 0.1` (nose RIGHT).
   - `roll=+1`, 30 ticks → `dot(up, right0) > 0.1` (top of car leans right).
2. **Responsiveness**: `pitch=1` from rest → local pitch rate ≥ 4.5 rad/s
   within 60 ticks (0.5 s), and `forward.y < −0.7` (nose past 45° down)
   within 60 ticks. (Current code: 0.27 rad/s at 0.5 s — fails massively.)
3. **Decay**: after 30 ticks of `pitch=1` then input released, |pitch rate|
   < 0.5 rad/s within a further 120 ticks (damping works in velocity mode).
4. **Consistency with dodge**: the dodge-forward axis and the aerial
   pitch-down axis agree — apply `pitch=+1` aerially for 10 ticks, record
   the angvel axis sign; assert it matches the sign of `dodgeAxis` captured
   from a forward dodge (reuse `dodgeFlip.spec.ts` patterns).
5. Regression sweep: full vitest — expect and fix fallout in
   `dodgeFlip.spec.ts` (flip-cancel bound), `airRollSensitivity.spec.ts`
   (magnitude ratios still hold — the sensitivity multiplier survives), AI
   suites (`aiDifficulty`, full-match hardening), `autoFlip.spec.ts`
   (should be untouched — no aerial input in those tests). Every threshold
   change needs an in-test comment citing the F5 physics change.
6. Playwright sanity: `tests/physics/car-driving.spec.ts` +
   `tests/game-flow/match-flow.spec.ts` green.
7. Docs: `docs/physics-deviations.md` — F5 section: the torque-impulse/
   inertia bug, the velocity-space rewrite, the sign convention table, new
   damping values.

**Commit point F5.**

---

## F6 — Remove the engine sound (keep boost + everything else)

### Current state (verified)

`src/integration/AudioEventAdapter.ts` emits `audio:engine-state` for the
player car with a speed hysteresis latch (lines ~108–124, `engineActive`
field). The user wants the hum gone; boost/UI/goal/countdown audio stay.

### Change

- Delete the engine-state emission block + `engineActive` field + its reset
  in the adapter. Keep `RetroAudioModule`'s engine-voice *capability* (the
  module-level `consumeEvent` handler) — removing the emitter alone is the
  minimal, easily-reversible change.
- Grep for other `audio:engine-state` emitters (there are none expected).

### Test gates

1. `tests/ui/audio.spec.ts`:
   - REWRITE "WS7.E: driving during a live match produces the player's
     engine hum voice" → "driving during a live match produces NO engine
     voice": same setup, drive with real key input, assert
     `activeContinuousVoices` never contains the engine voice id across a
     2 s window, AND in the same test boost with the bound input and assert
     the boost voice DOES activate (guards against over-deleting).
   - KEEP "engine-state continuous voice starts and stops with activity"
     (module-level test via direct `consumeEvent` — the capability remains).
2. Unit: if `tests/unit/` has an AudioEventAdapter spec (grep), update its
   engine expectations to "no engine event emitted from car observations".
3. Full audio suite green on both projects.
4. Docs: `docs/audio-deviations.md` — F6 note (emitter removed, module
   capability retained).

**Commit point F6.**

---

## F7 — Symmetrical floor texture pattern

### Root cause (verified)

`createPaneledFloor` picks each panel's texture with
`panelMaterials[context.random.integer(...)]` and a random quarter-turn —
pure noise, no symmetry.

### Change (`src/assets/procedural/StadiumGeometryFactory.ts`)

Replace the random picks with a deterministic pattern mirrored across both
field axes (keeps the alternating-texture look the user likes):

```ts
const mc = Math.min(column, FLOOR_PANEL_COLUMNS - 1 - column);
const mr = Math.min(row, FLOOR_PANEL_ROWS - 1 - row);
let material = panelMaterials[(mc * 2 + mr) % panelMaterials.length]!;
// accent override unchanged (already symmetric by construction)
panel.rotateZ((Math.PI / 2) * ((mc + mr) % 4));
```

(Exact index formula is free to vary for visual taste as long as it is a
pure function of `(mc, mr)` — that is what the gate asserts.)

Note: this removes two `context.random` draws per panel. The seeded stream
consumed by LATER procedural steps shifts — the preview-determinism
Playwright test compares two identically-seeded runs so it stays green, but
run the full suite to catch any test pinning exact random-derived values
downstream.

### Test gates

1. New unit test (`stadiumVisuals.spec.ts` or a new `floorPanels.spec.ts` —
   remember the one-AssetPipeline-per-file rule; build via
   `createStadiumBlockout` with a context that supplies ≥ 2 fake
   `floorPanelSet` textures): collect `FloorPanel` meshes into a
   `(column,row)` grid from their positions; assert for all `(c,r)`:
   - `grid[c][r].material === grid[COLS−1−c][r].material`
   - `grid[c][r].material === grid[c][ROWS−1−r].material`
   - same two equalities for the panel's quarter-turn rotation.
2. Existing `arena-shell.spec.ts` "paneled floor" Playwright test green.
3. Full vitest sweep for seeded-stream fallout (see note above).
4. Docs: `docs/visual-language-deviations.md` F7 note.

**Commit point F7.**

---

## F8 — Boost pad layout: remove 6 small pads

### Change (`src/physics/boost/BoostPadLayout.ts`)

Replace the `smallX × smallZ` loop with an explicit list (locked decision —
remaining smalls: `(±14, ±7)` and `(0, ±20)`):

```ts
const smallPositions: ReadonlyArray<readonly [number, number]> = [
  [-14, -7], [14, -7], [-14, 7], [14, 7], [0, -20], [0, 20]
];
```

IDs stay sequential `boost-small-0..5`. Full pads unchanged. Update the
doc comment (12-small/4-full → 6-small/4-full).

### Test gates

1. Update counts: `tests/unit/boostPads.spec.ts` (`toHaveLength(16)` → 10,
   render-binding `children.length` 16 → 10) and
   `tests/physics/boost-pads.spec.ts` (`toHaveLength(16)` → 10).
2. New layout assertion (unit): the definition list contains EXACTLY the six
   small positions above and the four full pads at `(±10, ±26)` — assert as
   a sorted coordinate set, not just counts.
3. Grep tests for hardcoded pad ids ≥ `boost-small-6` or removed coordinates
   (e.g. AI boost-route tests referencing `(14, 20)`) and update.
4. AI suites green (pad-awareness logic reads the registry dynamically).
5. Docs: `docs/physics-deviations.md` F8 one-liner (layout change, user
   request).

**Commit point F8.**

---

## F9 — Controller focus visibility on every menu button

### Root cause (verified)

`src/styles/retro-ui.css` provides the R11 amber `:focus` outline for
`.wo-item/.duration-item/.tab/.chip` — but **eight components** carry a
scoped `.menu-item:focus-visible { outline: none; }` (MainMenu, MatchSetup,
PauseMenu, ResultsScreen, TournamentBracket, TournamentVictory,
SettingsPanel, CarCustomise). When focus arrives via keyboard/gamepad both
`:focus` and `:focus-visible` match; equal specificity + later cascade →
`outline: none` wins. That is why chips highlight but `START MATCH` and the
pause-menu items don't.

### Change

Delete the `outline: none` on `:focus-visible` from every scoped style block
(keep the `:hover` halves of those rules and any transform styling). Audit
`CarCustomise.vue`'s `.swatch:focus-visible` too — if it suppresses the
outline, replace with a visible focus treatment (amber outline via the
global rule is fine; swatches aren't `.wo-item`, so add `.swatch:focus` to
the retro-ui.css rule list or a scoped visible style).

### Test gates

1. New Playwright `tests/ui/focus-visibility.spec.ts`: for each of —
   main-menu items, `start-match`, MatchSetup `BACK`, all three PauseMenu
   items (pause a match first), ResultsScreen buttons (finish a match),
   tournament setup buttons, a settings tab, a CarCustomise swatch — drive
   focus onto it via the virtual gamepad dpad (NOT `el.focus()` — test the
   real path), then assert
   `getComputedStyle(document.activeElement).outlineStyle !== "none"` and
   `outlineWidth !== "0px"`.
2. `tests/ui/controller-navigation.spec.ts` green unmodified.
3. Docs: `docs/build-decisions.md` F9 note (scoped `:focus-visible`
   suppressors vs the global R11 outline — cascade lesson).

**Commit point F9** (can share a commit with F10 — both are menu UI).

---

## F10 — Replace `window.confirm` with controller-navigable inline confirms

### Root cause (verified)

`PauseMenu.vue` `restartMatch()`/`returnToMenu()` call `window.confirm`.
Native dialogs are invisible to the gamepad layer (and Playwright
auto-dismisses them — the current controller-navigation test only passes
*because* the dialog auto-dismisses). Only these two call sites exist in
`src/`.

### Change (`src/components/hud/PauseMenu.vue`)

Local `confirming = ref<null | "restart" | "return">(null)`:

- Clicking RESTART/RETURN sets `confirming` instead of acting; the button
  column swaps (v-if) to: a `.wo-label` "ARE YOU SURE?" line + CONFIRM
  (`data-testid="pause-confirm-yes"`) + CANCEL
  (`data-testid="pause-confirm-no"`, **carries `data-menu-back`**; RESUME's
  `data-menu-back` is absent in this mode because the whole normal column is
  v-if'd out — so controller East cancels the confirm, not resumes).
- CONFIRM executes the pending action (`restartMatch()`/`returnToMenu()`
  runtime calls + the same UI sounds); CANCEL restores the normal column.
- Focus management: entering/leaving confirm mode must move DOM focus
  (`nextTick(() => …focus())`) onto CANCEL (safe default) — the R11
  composable only auto-focuses on match-state changes, which don't happen
  here. (F12 generalises root-change refocus; still set explicit focus here
  for the v-if swap within the same root.)

### Test gates

1. **Update** `tests/ui/controller-navigation.spec.ts`'s "south taps while
   paused never leak" test — it currently presses South twice on RESTART
   relying on the auto-dismissed dialog. New flow: first South opens the
   confirm row (assert visible, CANCEL focused), East cancels (still
   PAUSED, normal buttons restored), and the original no-leak assertions
   still hold on resume.
2. New Playwright tests (same file or `tests/ui/pause-confirm.spec.ts`):
   - Mouse: RETURN TO MENU → confirm visible → CONFIRM → `MAIN_MENU`.
   - Mouse: RESTART → CANCEL → still `PAUSED`, RESTART still present.
   - Pad: dpad to RESTART, South, South (CONFIRM ... note focus lands on
     CANCEL — navigate to CONFIRM first) → countdown state (restarted).
   - The mid-tournament pause-return abandonment test in
     `tests/game-flow/tournament.spec.ts` must be updated to click through
     the confirm — and stays green (safety net still fires).
3. Docs: `docs/build-decisions.md` F10 note.

**Commit point F10** (or F9+F10 combined).

---

## F11 — Ball-cam HUD indicator (bottom-left, device-aware binding label)

### Design

Always-visible element (locked decision) in `GameplayHud.vue`, bottom-left
mirroring the boost meter's placement: label "BALL CAM" + a key chip showing
the current toggle binding for the **most recently used input device** —
dimmed when ball cam off, lit (amber/cyan treatment) when on.

### Changes

1. **State plumbing** (`src/core/EventTypes.ts`, `GameRuntime.ts`,
   `src/stores/matchFlowStore.ts`, `App.vue`): extend
   `SessionStateChangedEvent` with
   `playerBallCamera: boolean` (from `cameraController?.isBallCameraEnabled() ?? false`)
   and `activeInputDevice: ActiveInputDevice` (new public getter
   `InputControlsModule.getActiveDevice()` — the private `activeDevice`
   field already tracks keyboard-mouse vs gamepad). Mirror both into the
   store exactly like `playerBoostAmount`.
2. **Binding label util**: extract the R10 SettingsPanel binding-label
   formatting (`KeyW` → `W`, `Space` → `SPACE`, mouse buttons → `LMB/MMB/RMB`,
   gamepad indices → names/`BTN n`) into
   `src/input/bindings/BindingLabels.ts`; SettingsPanel imports it (no
   behaviour change there — its tests must stay green).
3. **HUD** (`GameplayHud.vue`): `data-testid="ballcam-indicator"`, computed
   from store: device === "gamepad" → label for
   `bindings.gamepad.ballCameraButton`, else for
   `bindings.keyboardMouse.ballCamera`. Read bindings via
   `runtime.getControlBindings()` inside a computed that also depends on the
   per-tick store fields (so a rebind is picked up next tick). Class
   `active` when `playerBallCamera`.
4. Styling: mirror `.boost-meter`'s size/offset on the left; `.wo-label`
   typography; dim = 0.45 opacity, lit = full + amber ring.

### Test gates

1. New Playwright `tests/ui/ballcam-indicator.spec.ts`:
   - Start match (live RAF), indicator visible + NOT `.active`; press real
     Space → polls `.active`; press again → back to dim. Label reads
     `SPACE`.
   - Connect virtual pad, press any pad button (drives `activeDevice` to
     gamepad) → label switches to the `ballCameraButton` label; pad
     ball-cam button toggles `.active` (proves binding correctness
     end-to-end).
   - Rebind ball cam to `KeyB` via `runtime.setControlBindings`, press a
     real key (device back to keyboard) → label shows `B`.
2. `tests/camera/chase-camera.spec.ts` ball-cam toggle test green
   unmodified.
3. `tests/ui/settings.spec.ts` + `tests/input/rebinding.spec.ts` green
   (label-util extraction must not change SettingsPanel behaviour).
4. Docs: `docs/build-decisions.md` F11 note.

**Commit point F11.**

---

## F12 — Settings reachable from the pause menu

### Design (overlay — the match state must stay PAUSED)

Changing `matchState` to `SETTINGS` mid-match would un-pause physics
(`isPaused()` gates the fixed-tick early-return). So: keep `matchState ===
"PAUSED"` and overlay the settings panel UI.

### Changes

1. New flag in a UI store (extend `matchFlowStore` state or a tiny
   `uiStore`): `pauseSettingsOpen: boolean`.
2. `PauseMenu.vue`: new SETTINGS button (renumber `data-index`; keep RESUME
   first + `data-menu-back`) → sets the flag + confirm sound.
3. `App.vue` v-if chain:
   - `SettingsPanel` when `matchState === 'SETTINGS' || (matchState === 'PAUSED' && pauseSettingsOpen)`
   - `PauseMenu` when `matchState === 'PAUSED' && !pauseSettingsOpen`
   (exactly one `[data-menu-root]` visible at a time — required by R11 nav).
4. `SettingsPanel.vue` `back()`: if `pauseSettingsOpen` → clear the flag
   (stay PAUSED) + cancel sound; else existing `openMainMenu()`.
5. **Gamepad/Escape handling**:
   - R11 composable (`useMenuGamepadNavigation.ts`): generalise auto-focus —
     on each navigation frame, if the visible `[data-menu-root]` element is
     a different node than last frame, focus its first target. (Covers the
     overlay open/close AND F10's v-if swap; keep the existing match-state
     watcher too.)
   - Escape/pause-key while overlay open must close the overlay, NOT
     resume: find where `pausePressed` toggles resume in
     `GameRuntime`/system-input handling and guard on the flag (grep
     `pausePressed`). Controller East already routes to SettingsPanel's
     `[data-menu-back]` BACK → new `back()` → overlay closes. Also clear
     the flag defensively whenever `matchState` leaves `PAUSED`
     (resume/return while overlay somehow open).
6. Settings applied from the overlay use the existing live-apply paths
   (graphics preset, camera, audio, bindings all already apply live).

### Test gates

1. New Playwright `tests/ui/pause-settings.spec.ts`:
   - Pause mid-match → click SETTINGS → panel visible; `matchState` still
     `PAUSED`; car position identical across a 500 ms real-time wait
     (physics frozen); regulation clock unchanged.
   - Change graphics preset → `getVisualDiagnostics().preset` updated live;
     BACK → pause menu visible, RESUME focused; RESUME → `PLAYING`; the
     changed preset persisted in localStorage.
   - Escape while overlay open → overlay closes, still `PAUSED` (not
     resumed); Escape again → resumes.
   - Controller: pad-dpad navigates the overlay's tabs/sliders (reuse
     controller-navigation helpers); East → back at pause menu.
2. `tests/ui/settings.spec.ts` (menu-path settings) green unmodified.
3. `tests/ui/controller-navigation.spec.ts` green (single-root invariant
   held; pause tests unaffected by the new button — VERIFY the dpad-step
   counts in those tests still match the new button count and update the
   navigation steps deliberately if not, e.g. "dpad-down ×2 reaches RETURN
   TO MENU" becomes ×3 with SETTINGS inserted — check each).
4. Docs: `docs/build-decisions.md` F12 section (overlay-not-state rationale:
   pausing physics).

**Commit point F12.**

---

## F13 — AI stuck watchdog (auto-reset)

### Design

If the opponent car barely moves for a sustained window during live play,
teleport it to a safe reset pose. Placed in **`MatchFlowController`** (not
GameRuntime) so it is unit-testable with the established
`tick(physics, gameFlow)` harness — MatchFlowController already owns
match-state-conditional physics interventions (kickoff resets, goal blast).

- Constants: `AI_STUCK_WINDOW_TICKS = 480` (4 s — deliberately LONGER than
  `aiUnstuck.spec.ts`'s 3 s no-movement bound, so that test still gates the
  AI's own steering-based escape and the watchdog remains a last resort);
  `AI_STUCK_MIN_DISPLACEMENT = 1.0` (m, horizontal).
- In `applyPhysicsResults()` (after goal handling), only when
  `areControlsActive()`: track an anchor position + tick counter for
  `OPPONENT_CAR_ID`; if the car has moved ≥ 1.0 m horizontally from the
  anchor, re-anchor and zero the counter; else increment. On reaching 480:
  `physics.setCarState(OPPONENT_CAR_ID, { position: <reset pose>, rotation: <upright, facing player half>, linearVelocity: 0, angularVelocity: 0 })`,
  reset the counter. Reset pose: reuse the opponent's default kickoff spawn
  (grep `KICKOFF_VARIANTS` / `resetWorld` in `PhysicsFacade` and import or
  mirror variant 0's opponent pose — do NOT hardcode magic numbers that can
  drift from the real kickoff data).
- Reset anchor state on every match start / kickoff reset / state where
  controls go inactive (countdown parking must never accumulate).
- Never applies to the player car.

### Test gates (unit, `tests/unit/aiStuckWatchdog.spec.ts`)

1. Reach `PLAYING` via the countdown fast-forward harness; park the opponent
   (no inputs ever set for it), ball parked far away; tick 480 + 10 ticks →
   assert the opponent's position jumped to the reset pose (distance from
   parked spot > 5 m, at the kickoff pose within 0.5 m) with ~zero velocity.
2. Anti-false-positive: drive the opponent with `setCarInput(throttle: 1)`
   for 600 ticks → never teleported (position trace continuous, never within
   0.5 m of the reset pose unless it actually drove there — simpler: assert
   no single-tick displacement > 5 m).
3. Counter resets on goal/kickoff: park the opponent 300 ticks, score a
   goal (`setBallState` into sensor + 2 ticks), fast-forward through
   celebration+kickoff, park again 300 ticks → no teleport at the combined
   600 (the window restarted).
4. `tests/unit/aiUnstuck.spec.ts` green **unmodified** (3 s bound < 4 s
   watchdog — the AI must still free itself).
5. Full-match Playwright suites green (`tests/ai/`, hardening).
6. Docs: `docs/ai-calibration-log.md` F13 section (thresholds + why 4 s).

**Commit point F13.**

---

## F14 — Goal blast: bigger radius, stronger shove

### Change (locked decision: radius 26, Δv 30, falloff floor 0.4)

- `src/game-flow/MatchFlowController.ts`: `GOAL_BLAST_RADIUS = 26`,
  `GOAL_BLAST_MAX_DELTA_V = 30`.
- `src/physics/PhysicsFacade.ts` `applyRadialCarImpulse`: falloff becomes
  `Math.max(0.4, 1 - distance / radius)` inside the radius (still hard zero
  beyond). Update the doc comment.

Sanity (verified against arena dims): goal sensor centre sits at
`z = ±32.5`; a midfield car (z = 0) is 32.5 m away → still outside 26,
so the "midfield car unaffected" behaviour survives.

### Test gates

1. `tests/unit/goalBlast.spec.ts` updates:
   - Direct-method tests call with `(26, 30)`; nearby car (4 m) speed
     assertion raised to `≥ 15` (Δv ≈ 25+, capped by `carMaxSpeed` 23);
     new mid-range assertion: car at 24 m (inside) gets speed `≥ 10`
     (0.4 floor × 30, mass-normalised); car at 28 m (outside) `< 0.5`
     (replaces the old 25 m case).
   - Full-flow: parked-at-goal car `≥ 12` (was ≥ 6); midfield car `< 1`
     unchanged; idempotence test unchanged.
2. `tests/game-flow/match-flow.spec.ts` R6 blast test: raise its speed
   assertion to `> 12`.
3. Docs: `docs/physics-deviations.md` — amend the R6 section with the new
   constants + falloff floor.

**Commit point F14.**

---

## F15 — Final integration pass

1. `npx vue-tsc --noEmit`, full `npx vitest run`, `npm run validate` — all
   green.
2. Full Playwright, both projects (fresh `PLAYWRIGHT_TEST=1` build for
   preview). Apply the flake rule (§0.1) before treating any full-suite
   failure as real. Then `npm run test:release`.
3. **Screenshot QA** (throwaway spec, NOT committed — reuse the R14 QA
   patterns; the arena is dark near walls, so favour the menu wide shot and
   the corner-approach camera angles that worked in R14):
   - Menu wide shot: single hex layer on walls AND roof, square ~2×-size
     hexes, thicker lines, corner shell continuous with walls, symmetric
     floor pattern, ramps meeting the floor with no gap line.
   - Mid-match at a corner: car rounding the corner (drive-through, not
     crash).
   - Goal moment: blast visibly throwing a distant car.
   - HUD: ball-cam indicator dim + lit states.
   - Pause menu: SETTINGS button, confirm row, settings overlay.
   Fix obvious misses, re-run affected suites.
4. Manual feel checklist via existing suites (each newly gated above):
   kickoff-hold launch, aerial tilt direction+speed, corner drive-around,
   ramp base at speed, controller focus on every screen.
5. Docs sweep: each workstream's entry present;
   `docs/implementation-progress.md` gets an "Arena flush & refinements
   (F1–F15)" section; `docs/build-decisions.md` one summary entry.
6. Final commit + push.

---

## Appendix A — Constants changed

| Location | Key | Old → New |
|---|---|---|
| ArenaRampGeometry.filletRun | centre circle radius | `R − t` → `R + t` (surface flush) |
| ArenaRampGeometry.generateCorner | panel centre distance | `Rc·cos(δ/2)` ≈ 5.949 → `Rc + 0.5` = 6.5 |
| ArenaRampGeometry.generateCorner | chordHalf | `Rc·sin(δ/2)+0.05` ≈ 0.833 → `Rc·tan(δ/2)+0.05` ≈ 0.840 |
| HexPatternTexture | COL_STEP / HEX_CIRCUMRADIUS / ROW_STEP | 72 / 48 / 83.1 → 64 / 42.67 / 512⁄7 (periodic tile) |
| HexPatternTexture | LINE_WIDTH | 2.5 → 4.0 |
| StadiumGeometryFactory | glass geometry | boxes → inner-face planes; `repeat(10,10)` → per-geometry UVs @ `HEX_TILE_WORLD_SIZE = 11.5` |
| PhysicsParameters.aerial | pitch/yaw/roll damping | 2/2/3 → 2.8/3.2/4.95 |
| AerialController | integration | torque impulse → velocity-space `setAngvel`; axis signs per direction tests |
| GameRuntime gates | re-arm condition | any controls activation → only from `MENU_NAVIGABLE_STATES` |
| BoostPadLayout | small pads | 12 → 6 (locked list, §0.5) |
| MatchFlowController | GOAL_BLAST_RADIUS / MAX_DELTA_V | 16/18 → 26/30 |
| PhysicsFacade.applyRadialCarImpulse | falloff | linear → `max(0.4, linear)` |
| MatchFlowController | AI_STUCK_WINDOW_TICKS / MIN_DISPLACEMENT | new: 480 / 1.0 |

## Appendix B — Test inventory

**New files**: `aerialControl.spec.ts`, `aiStuckWatchdog.spec.ts` (unit);
`kickoff-throttle.spec.ts`, `focus-visibility.spec.ts`,
`ballcam-indicator.spec.ts`, `pause-settings.spec.ts` (Playwright;
`pause-confirm` may fold into controller-navigation).

**Modified**: `arenaRampGeometry.spec.ts` (anchor rewrite + flush/protrusion
invariants), `wallDriving.spec.ts` (+ base-step, + corner drive-around),
`stadiumVisuals.spec.ts` (planes/UV/texture-constant gates, floor symmetry),
`boostPads.spec.ts` + `boost-pads.spec.ts` (counts/positions),
`goalBlast.spec.ts` + `match-flow.spec.ts` (blast numbers),
`audio.spec.ts` (engine-voice inversion),
`controller-navigation.spec.ts` (confirm-row flow, pause dpad step counts),
`tournament.spec.ts` (pause-return confirm click-through),
`dodgeFlip.spec.ts` (flip-cancel bound re-measure if needed),
possibly AI aerial-pursuit sign follow-ups.

**Must stay green UNMODIFIED**: `tests/input/foundation.spec.ts`,
`tests/unit/aiUnstuck.spec.ts`, `tests/unit/autoFlip.spec.ts`,
`release-gate.spec.ts`, `airRollSensitivity.spec.ts` (thresholds may move
only with an in-test F5 citation).
