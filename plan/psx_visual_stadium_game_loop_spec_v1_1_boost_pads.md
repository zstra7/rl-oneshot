# Wipeout-Inspired PSX Visual Language, Stadium, UI, and Game Loop Specification

**Document version:** 1.2  
**Module IDs:** `VISUAL_LANGUAGE`, `STADIUM`, `UI`, `GAME_FLOW`, `VFX`  
**Primary audience:** A Sonnet-level coding LLM implementing these modules with minimal human intervention  
**Runtime:** Browser, local 1v1  
**Rendering:** Three.js / WebGL  
**Physics dependency:** `PHYSICS_MODULE_CONTRACT_VERSION = "2.0"`  
**Automated browser testing:** Playwright Test  
**Art direction:** Original Wipeout-inspired futuristic PSX  
**Atmosphere:** Dark transparent arena floating in space  
**Game-flow direction:** Simplified Rocket-League-style arcade flow  
**Supported match lengths:** 1, 3, or 10 minutes  

---

# 0. Instructions to the Implementing LLM

Read the full document before changing code.

1. Treat the physics module as authoritative for car and ball simulation.
2. Never duplicate movement, collision, boost, jump, dodge, gravity, or rigid-body logic here.
3. Never move a physics body to create a visual effect.
4. Keep rendering, VFX, UI, stadium art, and match rules modular.
5. Do not copy Wipeout or Rocket League assets, logos, layouts, names, or branding.
6. Capture their broad qualities only: futuristic PSX energy and readable arcade sports flow.
7. Use deterministic state machines, not scattered `setTimeout` calls.
8. Keep the 3D scene deliberately low resolution and the UI at native screen resolution.
9. Make all important visual strengths configurable through presets.
10. Expose deterministic Playwright test hooks.
11. Pool frequently spawned particles.
12. Prioritise ball, cars, goals, score, time, and boost over decoration.
13. Do not let dithering, jitter, glass, bloom, particles, or starfields reduce gameplay readability.
14. Record deviations in `docs/visual-gameflow-deviations.md`.
15. Record visual tuning in `docs/aesthetic-calibration-log.md`.
16. Keep future AI behind the standard `CarInputProvider` contract.
17. Keep stadium collision export separate from stadium visual meshes.
18. The first version may be rough, but it must support controlled iteration without architectural rewrites.

---

# 1. Product Vision

Build a compact local 1v1 car-football game suspended in deep space.

The target experience is:

```text
Rocket League's readable match structure
+
Wipeout-era PSX visual energy
+
A dark textured-glass arena floating in a pixel starfield
+
Fast arcade sessions with minimal menu friction
```

The player must immediately understand:

- Two cars
- One ball
- Two goals
- Player and opponent colours
- Match score
- Match timer
- Boost
- Countdown
- Golden-goal overtime
- Replay and return-to-menu options

The game must not feel like:

- A realistic racing simulation
- A modern glossy esports broadcast
- A direct Wipeout or Rocket League clone
- A generic neon cyberpunk scene
- A shader demo where gameplay becomes difficult to read
- A large multiplayer stadium
- A menu-heavy live-service game

---

# 2. Module Boundaries

## Visual-language module owns

- Low-resolution world render
- Nearest-neighbour upscale
- Vertex jitter
- Dither and colour quantisation
- Palette and material rules
- Texture filtering
- Low-poly guidelines
- Lighting style
- Visual presets

## Stadium module owns

- Stadium render geometry
- Stadium physics export
- Goals and goal sensors
- Spawn transforms
- Surface tags
- Floating-space presentation
- Starfield
- Structural ribs
- Textured transparent panels
- Field markings

## Game-flow module owns

- Main menu flow
- Match setup
- Match duration
- Countdown
- Match clock
- Goal processing
- Kickoff reset
- Regulation end
- Zero-second continuation
- Overtime
- Pause
- Results
- Replay
- Return to menu
- Score state

## UI module owns

- Main menu
- Settings
- Match setup
- HUD
- Countdown
- Goal and overtime banners
- Pause screen
- Result screen
- Focus and navigation
- Settings persistence

## VFX module owns

- Boost trails
- Jump bursts
- Powerslide sparks
- Car-ball impact particles
- Car-car impact particles
- Ball trail
- Goal explosion
- Boost-pad pickup burst
- Boost-pad depletion and respawn presentation
- Goal shockwave
- Arena pulse
- Starfield response

## Existing physics module owns

- Cars and ball
- Rigid bodies
- Contacts
- Arena collision
- Goal sensor overlap facts
- Spawn/reset execution
- Physics snapshots
- Physics events

## Future AI module owns

- Opponent planning
- Target selection
- Offence and defence
- Kickoffs
- Difficulty
- Producing `CarInput` for `car-opponent`

---

# 3. Cross-Module Contract

```ts
export const VISUAL_GAMEFLOW_CONTRACT_VERSION = "1.0";
export const REQUIRED_PHYSICS_CONTRACT_VERSION = "2.0";
```

Required physics inputs:

- `PhysicsArenaDefinition`
- Per-car `CarInput`
- Reset and teleport commands
- Pause/resume commands

Required physics outputs:

- `PhysicsRenderSnapshot`
- `CarObservation`
- `BallObservation`
- Goal-sensor events
- Car-ball and car-car impact events
- Jump, dodge, and contact events

Required match-flow events:

```ts
export type MatchFlowEvent =
  | { type: "match-state-changed"; from: MatchState; to: MatchState }
  | { type: "countdown-step"; value: 3 | 2 | 1 | "GO" }
  | { type: "goal-awarded"; team: TeamId; scorerCarId?: CarId }
  | { type: "kickoff-reset-started" }
  | { type: "kickoff-reset-completed" }
  | { type: "overtime-started" }
  | { type: "match-ended"; winner: TeamId | null };
```

Rendering and VFX consume events and immutable snapshots only.

---

# 4. Defaults and Assumptions

| Topic | Default |
|---|---|
| Art reference | Original Wipeout-inspired futuristic PSX |
| Arena mood | Dark space arena |
| Teams | Cyan player versus magenta opponent |
| Field size | 72 m long × 48 m wide |
| Interior height | 18 m |
| Goal size | 14 m wide × 6 m high × 5 m deep |
| Match choices | 1, 3, or 10 minutes |
| Default match | 3 minutes |
| Kickoff boost | 33 per car |
| Boost pads | 12 small and 4 full |
| Small pad | +12 boost, 4-second respawn |
| Full pad | Fill to 100, 10-second respawn |
| Overtime | Unlimited golden goal |
| Zero-second rule | Enabled |
| World render resolution | 320×180 |
| UI resolution | Native display resolution |
| Main-menu background | Live stadium presentation scene |
| Camera | Third-person chase camera |
| Goal celebration | 2.2 seconds before reset |
| Team sides | Player at negative Z, opponent at positive Z |
| Car visuals | One low-poly design with team variants |
| Crowd | No people; abstract light structures instead |

Keep all design values configurable.

---

# 5. Art Direction

Core phrase:

```text
A precision-built anti-gravity sports chamber,
constructed from dark metal ribs and imperfect textured glass,
floating in a dense pixel starfield,
seen through a low-resolution unstable PSX lens.
```

Capture:

- Aggressive geometric silhouettes
- Futuristic industrial signage
- High-contrast team colours
- Dark surfaces with emissive accents
- Low-poly construction
- Hard planar geometry
- Graphic floor markings
- Controlled sense of speed
- Technological tension

Do not copy:

- Wipeout logos, ships, sponsors, track designs, teams, or menus
- Rocket League logos, exact HUD assets, stadiums, cars, or goal effects

Visual hierarchy:

1. Ball
2. Player car
3. Opponent car
4. Goals
5. Arena boundaries
6. Score, time, and boost
7. Impact effects
8. Decorative architecture
9. Starfield

---

# 6. Colour System

```ts
export const VISUAL_PALETTE = {
  voidBlack: "#05060B",
  deepSpace: "#080B17",
  arenaBlack: "#10131B",
  graphite: "#1A1F2A",
  steel: "#2A3140",
  paleMetal: "#A8B1C2",

  playerCyan: "#24E6FF",
  playerCyanDark: "#087F99",

  opponentMagenta: "#FF3AAE",
  opponentMagentaDark: "#9A175F",

  neutralAmber: "#FFC84A",
  dangerRed: "#FF4D57",
  successGreen: "#68F5A2",

  uiWhite: "#EDF3FF",
  uiMuted: "#8993A7"
} as const;
```

Player identity:

- Cyan body strips
- Cyan goal frame
- Cyan boost particles
- Cool-white details
- Chevron pattern A

Opponent identity:

- Magenta body strips
- Magenta goal frame
- Magenta boost particles
- Warm-white details
- Chevron pattern B

Do not rely on colour alone. Use pattern, shape, labels, and goal markings.

Default quantisation:

```text
32 levels per RGB channel
```

Authentic preset may use 16–24 levels.

Never quantise DOM UI.

---

# 7. Rendering Pipeline

Use separate layers:

```text
3D world
-> world-space VFX
-> low-resolution render target
-> optional low-resolution glow
-> colour quantisation
-> Bayer dithering
-> contrast adjustment
-> nearest-neighbour upscale
-> native-resolution UI
```

Default internal resolution:

```ts
320 × 180
```

Presets:

| Preset | Internal resolution |
|---|---:|
| Authentic | 320×180 |
| Balanced | 426×240 |
| Clean | 640×360 |

Render target:

```ts
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
```

Disable MSAA in authentic mode.

UI, settings, score, timer, and countdown are rendered outside the PSX post-process.

---

# 8. Vertex Jitter

Goal: visible PSX instability without harming control.

Conceptual shader:

```glsl
vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
vec2 ndc = clip.xy / clip.w;
ndc = floor(ndc * uJitterResolution + 0.5) / uJitterResolution;
clip.xy = ndc * clip.w;
gl_Position = clip;
```

In high-performance WebGL shader programming, this vertex jitter must operate in screen space *after* the model-view-projection (MVP) matrix has consumed the interpolated transforms. This ensures the snapping grid remains stable relative to the camera and prevents sub-frame interpolation tearing on fast-moving objects like the ball or a dodging car.

Default jitter grid:

```ts
240 × 135
```

Strength by category:

| Category | Strength |
|---|---:|
| Arena metal | 1.0 |
| Cars | 0.65 |
| Ball | 0.25 |
| Goal outlines | 0.25 |
| Glass | 0.4 |
| Stars | 0 |
| UI | 0 |
| Debug geometry | 0 |

Rules:

- Deterministic for a given camera and transform
- Never random per frame
- Never changes physics
- Ball jitter remains subtle
- Thin gameplay lines use reduced jitter

---

# 9. Dither and Colour Quantisation

Use a fixed 4×4 Bayer matrix:

```text
 0  8  2 10
12  4 14  6
 3 11  1  9
15  7 13  5
```

Concept:

```glsl
colour += (bayerValue - 0.5) * uDitherStrength;
colour = floor(colour * uLevels + 0.5) / uLevels;
```

Defaults:

```ts
ditherStrength = 0.035;
colourLevels = 32;
```

Presets:

| Preset | Strength | Levels |
|---|---:|---:|
| Authentic | 0.045 | 16–24 |
| Balanced | 0.030 | 32 |
| Clean | 0.015 | 48–64 |

Anchor dither to screen pixels. Do not animate it.

Exclude:

- HUD
- Menus
- Settings
- Countdown numerals
- Accessibility overlays

---

# 10. Low-Poly Asset Rules

General:

- Large readable planes
- Hard silhouette breaks
- Flat or low-frequency shading
- Small graphic textures
- No unnecessary bevels
- No dense micro-detail

Car budget:

```text
1,200–2,000 triangles total
```

Suggested form:

- Wedge body
- Strong nose
- Dark canopy
- Visible wheels
- Rear boost assembly
- Readable roof marking
- Team-colour side panels

Ball budget:

```text
80–320 triangles
```

Ball design:

- Dark faceted body
- Bright amber-white seams
- Clear rim
- Brief team-colour impact flash

Stadium budget:

```text
Structural geometry: under 30k triangles
Decorative geometry: under 15k
Transparent panels: under 10k
```

Texture targets:

| Asset | Size |
|---|---:|
| Car | 128² or 256² |
| Ball | 64² or 128² |
| Stadium atlas | 256² or 512² |
| Particles | 16²–64² |

Use nearest filtering for world textures.

---

# 11. Materials and Lighting

Use:

- One directional key light
- Low ambient fill
- Emissive team accents
- Optional baked vertex colours
- Restrained glow
- No expensive real-time GI

Suggested:

```ts
ambientIntensity = 0.35;
keyLightIntensity = 1.4;
```

Dark metal:

```text
roughness 0.65–0.9
metalness 0.2–0.5
```

Avoid modern glossy reflections.

Transparent stadium panels are layered:

```text
Layer A: faint dark tinted panel
Layer B: opaque structural frame
Layer C: emissive grid and scan texture
```

Recommended panel opacity:

```text
0.16–0.28
```

Avoid one giant transparent enclosure mesh.

Goal net:

- Holographic grid
- Team-colour scan
- No realistic cloth
- Ball remains visible inside

---

# 12. Stadium Concept and Dimensions

Arena concept:

```text
Dense starfield
-> floating mechanical platform
-> dark structural exoskeleton
-> segmented textured glass shell
-> illuminated field
-> cyan and magenta goals
```

Dimensions:

```ts
export const STADIUM_DIMENSIONS = {
  fieldLength: 72,
  fieldWidth: 48,
  interiorHeight: 18,
  goalWidth: 14,
  goalHeight: 6,
  goalDepth: 5,
  cornerRadius: 6,
  floorWallTransitionRadius: 4,
  wallCeilingTransitionRadius: 3
} as const;
```

Coordinates:

```text
X = width
Y = up
Z = field length
centre = (0,0,0)
X bounds = -24 to +24
Z bounds = -36 to +36
```

Goals:

```text
Player-defended goal: Z = -36
Opponent-defended goal: Z = +36
```

Spawns:

```ts
ball = { x: 0, y: 0.9125, z: 0 };

player = {
  position: { x: 0, y: restingCarHeight, z: -23 },
  facing: "+Z"
};

opponent = {
  position: { x: 0, y: restingCarHeight, z: 23 },
  facing: "-Z"
};
```

Initial kickoff uses symmetrical centre spawns.

---

# 13. Stadium Geometry

Physics shell requires:

- Flat central floor
- Smooth floor-to-wall curves
- Rounded corners
- Smooth wall-to-ceiling curves
- Goal openings
- Goal interiors
- No sharp internal seams
- No gaps at maximum ball speed

Visual floor:

- Dark metal/composite panels
- Wide emissive centre line
- Centre circle
- Goal-box markings
- Team-half accents
- Directional goal chevrons
- Sparse wear
- Slow scan texture

Structural ribs:

- Thick enough to read at 320×180
- Instanced
- Help show wall curvature
- Create silhouette against space
- Never block goals

Transparent shell:

- Segmented panels
- Dark tint
- Faint grid
- Scratches
- Edge strips
- Subtle team response near goals

Floating base:

- Mechanical platform
- Fins
- Antennas
- Thrusters
- Warning lights
- Dark underside

The base is visual unless exported as collision.

---

# 14. Stadium Physics Export

```ts
export interface StadiumPhysicsExport {
  arena: PhysicsArenaDefinition;
  metadata: StadiumMetadata;
}
```

Recommended collider groups:

- Floor
- Side walls
- Back walls
- Ceiling
- Curved transitions
- Goal interior
- Goal posts
- Goal sensors

Goal sensor:

```ts
interface GoalSensorDefinition {
  id: string;
  defendingTeam: TeamId;
  scoringTeam: TeamId;
  centre: Vec3Data;
  halfExtents: Vec3Data;
}
```

Valid goal:

1. Ball centre crosses behind goal plane.
2. Ball enters matching sensor.
3. Match state allows scoring.
4. Sensor is not already latched.

Cars entering sensors do not score.

After score:

```ts
goalLatch = true;
```

Clear after kickoff reset.

---


# 15. Boost Pad Layout and Visual System

Boost pads are mandatory parts of the stadium, match economy, VFX language, and AI navigation.

The stadium module owns pad definitions and positions.

The physics module owns:

- Pickup eligibility
- Boost mutation
- Simultaneous claim resolution
- Active/inactive state
- Respawn timers
- Collection and respawn events

The visual/VFX modules mirror the authoritative physics state.

## 15.1 Shared constants

```ts
export const BOOST_PAD_PRESENTATION = {
  kickoffBoost: 33,

  smallAmount: 12,
  smallRespawnSeconds: 4,

  fullAmount: 100,
  fullRespawnSeconds: 10
} as const;
```

## 15.2 Required arena layout

Use a symmetric initial layout with:

```text
12 small pads
4 full pads
```

Coordinates are metres in X/Y/Z with floor Y determined by the visual pad inset.

### Small pads

```ts
export const SMALL_BOOST_PAD_POSITIONS = [
  { id: "boost-small-01", x:  0,  z: -11 },
  { id: "boost-small-02", x:  0,  z:  11 },

  { id: "boost-small-03", x: -10, z: -13 },
  { id: "boost-small-04", x:  10, z: -13 },
  { id: "boost-small-05", x: -10, z:  13 },
  { id: "boost-small-06", x:  10, z:  13 },

  { id: "boost-small-07", x: -17, z: -25 },
  { id: "boost-small-08", x:  17, z: -25 },
  { id: "boost-small-09", x: -17, z:  25 },
  { id: "boost-small-10", x:  17, z:  25 },

  { id: "boost-small-11", x: -18, z: 0 },
  { id: "boost-small-12", x:  18, z: 0 }
] as const;
```

### Full pads

```ts
export const FULL_BOOST_PAD_POSITIONS = [
  { id: "boost-full-01", x: -19.5, z: -17.5 },
  { id: "boost-full-02", x:  19.5, z: -17.5 },
  { id: "boost-full-03", x: -19.5, z:  17.5 },
  { id: "boost-full-04", x:  19.5, z:  17.5 }
] as const;
```

The layout is:

- Symmetric across X.
- Symmetric under a 180-degree field rotation.
- Reachable without driving directly into walls.
- Dense enough for 1v1 rotations.
- Sparse enough that boost remains a tactical resource.
- Open to calibration after playtesting.

## 15.3 Stadium export

```ts
export interface StadiumBoostPadDefinition {
  id: BoostPadId;
  type: "small" | "full";

  position: Vec3Data;
  rotation: QuaternionData;

  pickupRadius: number;
  pickupHalfHeight: number;

  visualVariant: string;
}
```

`StadiumPhysicsExport.arena.boostPads` is required and never empty for the standard arena.

## 15.4 Small-pad visual design

Small pads should be floor-integrated and readable without dominating the field.

Shape:

- Low-poly hexagonal or angular inset
- Approximately 1.2–1.5 m visual diameter
- Thin amber-white emissive perimeter
- Small rising pixel glyphs when active
- Dark metal centre
- No large floating orb

Active:

- Slow segmented rotation or phase shift
- 4–8 tiny amber square particles
- Clear glow at gameplay distance
- Subtle vertical marker no higher than about 0.35 m

Inactive:

- Emissive perimeter off or dim
- Dark recessed plate remains visible
- Faint progress pattern as respawn approaches

## 15.5 Full-pad visual design

Full pads must be instantly distinguishable.

Shape:

- Larger angular ring or layered star/diamond plate
- Approximately 2.2–2.8 m visual diameter
- Strong amber-white core
- Taller low-poly energy column or rotating shard cluster
- More visible from chase camera

Active:

- 12–24 pooled square/strip particles
- Slow vertical motion
- Bright segmented ring
- Clear silhouette after dither and quantisation

Inactive:

- Dark ring remains
- Dim internal scan
- Respawn anticipation begins in final 1.5 seconds

Do not copy Rocket League's exact floating boost-orb asset.

## 15.6 Collection VFX

On `boost-pad-collected`:

Small:

- 8–16 amber pixel shards
- Fast inward collapse or upward pop
- 100–180 ms light flash
- Pad energy disappears immediately

Full:

- 24–48 amber/white shards
- Brief vertical beam collapse
- 180–260 ms ring pulse
- Stronger but still local effect

The collecting car may receive:

- Brief nozzle accent
- Tiny HUD boost-number pulse
- Optional controller/audio hook

Do not obscure the car or ball.

## 15.7 Respawn presentation

Inactive pad knows exact remaining time from physics observation.

Small pad:

- Remains mostly dark
- Final 0.75 seconds: perimeter segments illuminate in sequence

Full pad:

- Final 1.5 seconds: ring segments fill
- Final 0.25 seconds: stronger pulse
- On respawn: quick vertical build and particle pop

Visual countdown is approximate presentation only.

Physics tick determines actual availability.

## 15.8 Team neutrality

Boost pads are neutral amber/white.

Do not colour active pads by team.

A pad can briefly mix with collecting team colour during pickup, but its base identity remains neutral.

## 15.9 Readability

Pads must remain visible:

- Through PSX dithering
- Against dark floor
- From chase camera
- During goal-side movement
- In authentic 320×180 mode

Pads must not resemble:

- Ball
- Goal sensors
- Goal markers
- Team spawn markers

## 15.10 Collision and rendering separation

Visual pad meshes:

- Do not control collection.
- Do not create physical bumps.
- May be slightly inset into floor.
- Must not cause camera collision.
- Must not block the ball.

Physics sensors are invisible and exported separately.

## 15.11 Match reset

Every kickoff reset:

- Both cars receive 33 boost.
- Every pad becomes active.
- All pad respawn presentation resets.
- Any lingering pickup VFX is cleared or allowed to expire without changing pad state.

## 15.12 Required Playwright tests

- Standard arena exports exactly 12 small and 4 full pad definitions.
- Every pad ID is unique.
- Layout is symmetric.
- Pad positions remain inside playable bounds.
- Visual state matches physics active/inactive state.
- Collection effect triggers once.
- Full and small effects are visually distinct.
- Respawn visual begins before authoritative respawn but cannot collect early.
- Kickoff reset makes every pad visibly active.
- Authentic preset keeps pads readable.
- Reduced-effects mode lowers particles but preserves active-state readability.

# 16. Starfield

Use a deterministic 3D starfield.

Layers:

| Layer | Count | Behaviour |
|---|---:|---|
| Far | 1,500–3,000 | Tiny, dense, almost static |
| Mid | 300–700 | Larger, mild parallax |
| Near | 50–150 | Rare squares, crosses, short streaks |

Use `THREE.Points` or instanced camera-facing quads.

Visual shapes:

- Single pixels
- Two-pixel crosses
- Square clusters
- Short strips

Avoid smooth circular bokeh.

Colours:

- Cool white
- Muted blue
- Dim violet
- Rare cyan, magenta, amber

During a goal:

- Radial star streak
- Team-colour pulse
- Brief exposure lift
- Return within 0.5 seconds

Do not place dense stars directly behind goals or centre field.

---

# 17. Car and Ball Visuals

Shared car structure:

```text
CarPhysicsRoot
└─ CarVisualAlignment
   ├─ Body
   ├─ Wheels
   ├─ BoostNozzle
   └─ VfxAnchors
```

Physics root follows interpolated snapshot.

Visual child is aligned to the Octane-style hitbox.

Player variant:

- Cyan stripes
- Cyan underglow
- Cyan boost
- Pattern A

Opponent variant:

- Magenta stripes
- Magenta underglow
- Magenta boost
- Pattern B

Wheel spin and steering are visual only.

Ball:

- Faceted sphere
- Graphite shell
- Amber-white seams
- Strong contrast
- Contact flash
- Short segmented speed trail

Ball trail:

```text
Starts near 12 m/s
8–18 segments
Maximum history about 1.2 seconds
```

---

# 18. Particle Architecture

Pool:

- Boost particles
- Small boost pad active/inactive/respawn
- Full boost pad active/inactive/respawn
- Jump particles
- Slide sparks
- Impact sparks
- Goal shards
- Ball-trail segments

Preferred particles:

- Squares
- Triangles
- Short strips
- Low-poly fragments
- Nearest-filtered sprites

Avoid:

- Soft smoke
- High-resolution fire
- Smooth lens flares
- Huge transparent clouds

Particle spawning is event-driven.

Particle completion never controls game rules.

---

# 19. Required VFX

Boost:

- Nozzle core
- Team square particles
- Short trail
- Occasional bright shard
- Immediate start/stop

First jump:

- Floor-facing burst
- Four rectangular shards
- Underbody flash

Second jump:

- Airborne cross/ring
- No floor dust

Powerslide:

- Team-colour wheel sparks
- Pixel floor debris
- Only above lateral-slip threshold

Car-ball hit:

| Strength | Effect |
|---|---|
| Gentle | Flash + 3–6 particles |
| Strong | Flash + 10–24 particles + short ring |
| Flip hit | Strong ring + intensified ball trail |

Car-car hit:

- Neutral sparks
- Team-colour secondary shards
- Optional small camera impulse

Wall hit:

- Small white-blue sparks only

---

# 20. Goal Celebration

Goal is the largest visual event.

Sequence:

```text
0.00 s: score latch and short hit-stop
0.05 s: goal interior flash
0.10 s: low-poly shockwave
0.15 s: pixel shards and star streaks
0.20 s: GOAL banner
0.30 s: ribs pulse toward centre
1.20 s: particles fade
2.20 s: begin reset transition
```

Recommended visual hit-stop:

```text
80 ms
```

Goal effect components:

- Expanding team-colour ring
- One or two secondary rings
- 80–180 square/triangle/strip particles
- Goal-frame pulse
- Floor chevron wave
- Transparent-panel grid flash
- Starfield radial streak
- Slight FOV kick
- Small camera impulse

Do not use an opaque full-screen explosion.

Reduced-effects mode lowers:

- Flash brightness
- Particle count
- Star streak
- Shake
- Ring opacity

---

# 21. Camera

Gameplay camera:

```ts
distance = 7.5;
height = 3.2;
lookAhead = 4.5;
fov = 72;
```

Camera reads physics snapshots only.

Features:

- Smoothed position
- Smoothed target
- Velocity look-ahead
- Ball-aware framing
- Stadium collision avoidance
- Goal and impact impulses

Camera collision:

- Ray or sphere cast from target to desired camera position
- Move inward if blocked
- Never allow unstable clipping through transparent shell

Shake settings:

```text
Off
Low
Full
```

Default: Low.

Menu camera:

- Slow loop
- Car and ball visible
- Goal and starfield visible
- No uncontrolled match running behind menu

Countdown camera:

- Normal chase camera
- Already settled behind player
- No long cinematic before each kickoff

---

# 22. UI Language

Visual character:

- Angular
- Dark
- Technical
- High contrast
- Hard-edged
- Cyan/magenta accents
- Short transitions
- Original design

Avoid:

- Rounded mobile cards
- Frosted-glass blur
- Tiny decorative text
- Slow luxury animation
- Exact Rocket League panel designs

Typography roles:

```text
Display: wide futuristic geometric
Utility: compact monospace or square grotesk
```

Bundle a licence-compatible font.

Fallback:

```css
font-family: "Oxanium", "Arial Narrow", monospace;
```

UI transitions:

```text
Small: 120–180 ms
Normal: 180–260 ms
Large screen: 280–400 ms
```

Focus state:

- Bright outline
- Chevron
- Accent change
- Audio hook

---

# 23. Main Menu

Background:

- Live presentation stadium
- Player car shown on field
- Ball visible
- Opponent goal visible
- Starfield visible
- Slow camera rail
- Low-intensity particles

Required menu items:

```text
PLAY
SETTINGS
```

Optional later:

```text
HOW TO PLAY
CREDITS
```

Place menu left or lower-left.

Keep car readable behind/right of menu.

Selection:

- Shift 6–12 px
- Bright accent bar
- Brief scan/glitch
- Fast transition

---

# 24. Match Setup

Required duration choices:

```text
1 MIN
3 MIN
10 MIN
```

Default:

```text
3 MIN
```

Required buttons:

```text
START MATCH
BACK
```

Reserve future row:

```text
OPPONENT DIFFICULTY
```

Until AI spec exists, show `STANDARD` or disabled placeholder.

Keep stadium background visible.

Move menu camera toward centre field.

---

# 25. Settings

Categories:

```text
GAMEPLAY
CAMERA
GRAPHICS
AUDIO
CONTROLS
ACCESSIBILITY
```

Gameplay:

- Default match length
- Camera shake
- Goal celebration intensity
- Vibration hook

Camera:

- FOV
- Distance
- Height
- Stiffness
- Ball-look strength
- Shake

Graphics:

- Pixel preset
- Vertex jitter
- Dither
- Colour levels
- Glow
- Particle density
- Star density
- Fullscreen

Audio hooks:

- Master
- Music
- Effects
- UI

Controls:

- Show keyboard and gamepad bindings
- Rebinding may be deferred

Accessibility:

- Reduced shake
- Reduced flashes
- Reduced jitter
- High-contrast ball
- Team-pattern mode
- Larger HUD
- Disable dithering

Persistence:

```ts
localStorage key = "space-carball-settings-v1";
```

Validate loaded settings and fall back safely.

---

# 26. Gameplay HUD

Top centre:

```text
PLAYER SCORE | TIMER | OPPONENT SCORE
```

Cyan left, magenta right.

Timer:

```text
M:SS
```

Overtime:

```text
OT 0:12
```

Boost bottom-right:

- Large `0–100`
- Angular segmented meter
- Team accent
- Pulse below 20
- Strong zero state

Labels:

```text
YOU
CPU
```

Hide HUD outside active match presentation.

Keep score visible during goal celebration.

---

# 27. Countdown

Timing:

```text
3 = 1.0 s
2 = 1.0 s
1 = 1.0 s
GO = 0.75 s
```

Before GO:

- Cars held at spawn
- Ball held at centre
- Human and AI controls neutralised
- Match clock stopped

At GO:

- Release controls
- Start/resume clock
- Emit start event
- Fade GO

Visual:

- Large amber numeral
- Angular outline
- Short scale punch
- One-frame glitch stripe
- Arena light pulse

---

# 28. Match State Machine

```ts
export type MatchState =
  | "BOOT"
  | "MAIN_MENU"
  | "MATCH_SETUP"
  | "SETTINGS"
  | "MATCH_LOADING"
  | "KICKOFF_SETUP"
  | "COUNTDOWN_3"
  | "COUNTDOWN_2"
  | "COUNTDOWN_1"
  | "COUNTDOWN_GO"
  | "PLAYING"
  | "ZERO_SECOND_PLAY"
  | "GOAL_LATCHED"
  | "GOAL_CELEBRATION"
  | "KICKOFF_RESET"
  | "OVERTIME_INTRO"
  | "OVERTIME_PLAYING"
  | "MATCH_ENDING"
  | "MATCH_RESULTS"
  | "PAUSED";
```

One `MatchFlowController` owns state.

UI requests actions; it never directly assigns state.

Core flow:

```text
BOOT -> MAIN_MENU
MAIN_MENU -> MATCH_SETUP / SETTINGS
MATCH_SETUP -> MATCH_LOADING
MATCH_LOADING -> KICKOFF_SETUP
KICKOFF_SETUP -> 3 -> 2 -> 1 -> GO
GO -> PLAYING
PLAYING -> GOAL or ZERO_SECOND_PLAY or PAUSED
GOAL -> CELEBRATION -> RESET -> COUNTDOWN
ZERO_SECOND_PLAY -> MATCH_END or OVERTIME
OVERTIME -> COUNTDOWN -> OVERTIME_PLAYING
OVERTIME_GOAL -> RESULTS
RESULTS -> REPLAY or MAIN_MENU
```

---

# 29. Match Clock and Zero-Second Rule

Duration:

```ts
type MatchDurationMinutes = 1 | 3 | 10;
```

Clock advances only in:

```text
PLAYING
```

Clock does not advance during:

- Countdown
- Goal celebration
- Reset
- Pause
- Overtime intro
- Results

Use deterministic game ticks aligned with 120 Hz physics.

At regulation zero:

- Enter `ZERO_SECOND_PLAY`
- Display `0:00`
- Continue controls and physics

Dead-ball condition:

```ts
ballHasFloorContact &&
ballVerticalSpeed <= 1.0
```

Wall and ceiling contact do not end zero-second play.

At dead ball:

```text
Scores different -> MATCH_ENDING
Scores tied -> OVERTIME_INTRO
```

A goal during zero-second play counts normally.

---

# 30. Goal Processing

Goals are valid only in:

```text
PLAYING
ZERO_SECOND_PLAY
OVERTIME_PLAYING
```

On valid sensor event:

1. Check latch false.
2. Determine scoring team from sensor.
3. Set latch.
4. Increment score once.
5. Disable controls.
6. Emit goal event.
7. Enter goal states.
8. Start VFX.

Optional scorer attribution:

- Use last car-ball touch
- Do not block goal if unavailable

Own goal:

- Point still awarded to attacking team

Regulation goal reset:

1. Complete celebration.
2. Clear transient effects.
3. Reset cars and ball.
4. Restore kickoff boost.
5. Clear pair contacts and latch.
6. Begin countdown.

---

# 31. Kickoff Reset

Atomic physics command:

```ts
physics.resetMatchState({
  cars: [
    { id: "car-player", transform: playerSpawn, boost: 33 },
    { id: "car-opponent", transform: opponentSpawn, boost: 33 }
  ],
  ball: {
    transform: ballSpawn,
    resetVelocity: true
  },
  resetBoostPads: true,
  kickoffBoostAmount: 33
});
```

Reset:

- Position
- Rotation
- Linear velocity
- Angular velocity
- Jump state
- Dodge state
- Powerslide blend
- Temporary contact state
- Goal overlap
- Temporary VFX

Hide teleport with:

```text
150 ms pulse/fade
reset
150 ms return
```

---

# 32. Overtime

Trigger:

```text
Regulation tied after dead ball
```

Intro:

```text
OVERTIME
GOLDEN GOAL
```

Duration:

```text
1.5 s
```

Then kickoff reset and countdown.

Overtime clock counts up:

```text
OT 0:00
OT 0:01
...
```

Unlimited duration.

First valid goal:

```text
GOAL -> CELEBRATION -> MATCH_ENDING -> RESULTS
```

No additional kickoff.

---

# 33. Pause and Results

Pause allowed during:

- Playing
- Zero-second play
- Overtime

Pause behaviour:

- Stop physics
- Stop clock
- Stop AI progression
- Freeze gameplay particles or update only ambient menu-safe effects
- Keep frame visible

Pause menu:

```text
RESUME
RESTART MATCH
SETTINGS
RETURN TO MENU
```

Confirm destructive choices.

Results screen:

- `VICTORY` or `DEFEAT`
- Final score
- Match duration
- Overtime indicator
- `REPLAY`
- `RETURN TO MENU`

Replay:

- Same settings
- Reset scores and clocks
- Begin fresh countdown
- Not a video replay

Return to menu:

- Dispose match VFX
- Keep settings
- Switch to menu presentation scene

---

# 34. Runtime Order

```text
1. Collect UI and gameplay input.
2. Update app and match-flow state.
3. If physics enabled:
   a. Prepare human input.
   b. Prepare AI input.
   c. Submit both car inputs.
   d. Step fixed physics tick.
   e. Consume physics events.
   f. Apply goal and dead-ball rules.
4. Emit match-flow events.
5. Update VFX.
6. Interpolate render transforms.
7. Update camera.
8. Render low-resolution world.
9. Apply PSX post-process.
10. Upscale.
11. Render native-resolution UI.
```

Do not run separate uncontrolled timers for countdown, goals, clock, AI, or particles.

---

# 35. Application and Session State

```ts
type AppState = "BOOT" | "MENU" | "MATCH";

interface GameSessionState {
  appState: AppState;
  matchState: MatchState;

  selectedDurationMinutes: 1 | 3 | 10;

  playerScore: number;
  opponentScore: number;

  regulationTimeRemaining: number;
  overtimeElapsed: number;

  pausedFromState: MatchState | null;
}
```

---

# 36. Navigation

Support:

- Keyboard
- Mouse
- Gamepad-ready architecture

Keyboard:

```text
Arrow keys / WASD = navigate
Enter = confirm
Escape = back or pause
```

Gamepad:

```text
D-pad / left stick = navigate
South button = confirm
East button = back
Start = pause
```

Restore previous focus when returning from settings.

Never leave keyboard focus invisible.

---

# 37. Visual Presets

```ts
export const DEFAULT_VISUAL_PRESET = {
  pixelResolution: "authentic",
  vertexJitter: 0.65,
  ditherStrength: 0.035,
  colourLevels: 32,
  glowEnabled: true,
  glowStrength: 0.35,
  particleDensity: 1.0,
  starfieldDensity: 1.0,
  cameraShake: "low",
  reducedFlashes: false,
  highContrastBall: false
};
```

Provide:

```text
AUTHENTIC
BALANCED
CLEAN
```

Reduced-effects mode lowers:

- Goal particle count
- Boost-pad pickup particle count
- Boost-pad respawn particle count
- Flash brightness
- Star streaks
- Screen shake
- Vertex jitter
- Dither

Gameplay does not change.

---

# 38. Performance Targets

Target:

```text
60 FPS minimum
120 Hz physics
```

Budgets:

```text
Under 150 draw calls
Under 30 transparent draw calls
Under 2,000 normal active particles
Under 4,000 peak goal particles
Under 80,000 visible triangles
```

When performance drops:

1. Reduce particles.
2. Reduce star density.
3. Disable optional glow.
4. Simplify transparent overlays.
5. Change internal render preset.

Never reduce physics tick rate.

---

# 39. Browser Game Test API

```ts
declare global {
  interface Window {
    __GAME_TEST__?: BrowserGameTestApi;
  }
}
```

Required:

```ts
export interface BrowserGameTestApi {
  ready(): boolean;

  resetApplication(): void;
  resetMatch(options?: Partial<MatchConfig>): void;

  getAppState(): AppState;
  getMatchState(): MatchState;
  getSessionState(): GameSessionState;

  openMainMenu(): void;
  openMatchSetup(): void;
  openSettings(): void;

  selectMatchDuration(minutes: 1 | 3 | 10): void;
  startMatch(): void;

  advanceGameTicks(count: number): void;
  advanceGameSeconds(seconds: number): void;

  simulateGoal(scoringTeam: TeamId): void;
  simulateBallFloorContact(): void;
  simulateBoostPadPickup(
    padId: BoostPadId,
    carId: CarId
  ): void;
  getBoostPadVisualStates(): BoostPadVisualState[];

  pause(): void;
  resume(): void;
  replayMatch(): void;
  returnToMenu(): void;

  setVisualPreset(partial: DeepPartial<VisualPreset>): void;
  getVisualPreset(): VisualPreset;

  setCameraPreset(preset: TestCameraPreset): void;
  setPresentationSeed(seed: number): void;

  getMatchFlowEvents(): MatchFlowEvent[];
  clearMatchFlowEvents(): void;

  getVisualDiagnostics(): VisualDiagnostics;
}
```

The presentation seed controls:

- Star layout
- Ambient menu particles
- Goal-particle random sequence in screenshots
- Decorative motion phase

---

# 40. Playwright Game-Flow Tests

Required tests:

## Main menu

- PLAY visible
- SETTINGS visible
- Background canvas visible
- Focus visible
- Correct app state

## Duration

For 1, 3, and 10:

- Selection changes config
- Start match retains selection

## Countdown

Assert order:

```text
COUNTDOWN_3
COUNTDOWN_2
COUNTDOWN_1
COUNTDOWN_GO
PLAYING
```

Assert controls disabled before GO.

## Timer

For one-minute match:

- Starts `1:00`
- Reaches `0:30`
- Pauses correctly
- Resumes correctly

## Boost pads

- Small and full pads render distinctly.
- Pickup event deactivates the matching visual once.
- Respawn state follows physics observation.
- Kickoff reset restores all pad visuals.
- A full-boost car does not trigger a false collection effect.

## Goal

- Score increments once
- Goal latch prevents duplicate
- Celebration starts
- Reset occurs
- Countdown restarts

## Zero-second

- Clock reaches zero with ball airborne
- State remains live
- Floor contact ends regulation

## Overtime

- Tied regulation enters overtime
- Overtime intro shown
- Kickoff occurs
- Clock counts upward
- First goal ends match

## Results

- Victory/defeat visible
- Final score correct
- Replay and return buttons visible

## Replay

- Scores reset
- Duration retained
- Countdown restarts

## Return to menu

- HUD hidden
- Menu shown
- Settings retained

---

# 41. Playwright Visual Regression

Use fixed:

- Viewport
- Device scale
- Camera
- Presentation seed
- Simulation tick
- Font load
- Browser and CI environment

Required screenshots:

- Main menu
- Match setup
- Settings
- Countdown 3
- GO
- Gameplay HUD
- Low boost
- Goal celebration
- Overtime intro
- Pause
- Victory
- Defeat
- Stadium top view
- Goal close-up
- Transparent wall
- Starfield
- Both cars
- Ball against floor
- Authentic preset
- Balanced preset
- Clean preset

Effect isolation:

- Jitter off/on
- Dither off/on
- Quantisation off/on
- Glow off/on
- Glass layers
- Goal particles
- Boost particles

---

# 42. Visual and Stadium Invariants

Assert:

- UI is outside PSX post-process.
- Score and timer are visible during play.
- Ball contrast exceeds configured minimum.
- Team colours remain distinguishable after quantisation.
- Goal openings are not blocked.
- Reduced-flash mode lowers goal intensity.
- Particle pools stop growing after warm-up.
- Starfield seed is repeatable.
- Camera never contains NaN.
- Keyboard focus remains visible.
- Ball rolls through goal mouth.
- Goal sensor awards correct side.
- All 16 boost-pad definitions align with their visual floor plates.
- Ball and cars pass over pad visuals without physical obstruction.
- Cars can enter goals.
- Ball cannot escape collision seams.
- Cars cannot escape transitions.
- Goal frame reads from midfield.
- Transparent walls read against black space.
- Stars do not hide the ball.

---

# 43. Aesthetic Iteration Workflow

The first art pass will not be final.

Use:

```text
Implement
-> capture fixed screenshots
-> inspect visual hierarchy
-> play at full speed
-> test readability
-> change one visual system
-> compare A/B
-> rerun snapshots
-> profile performance
-> record decision
```

Tune in this order:

1. Camera and ball readability
2. Stadium dimensions
3. Goal readability
4. Team distinction
5. Base lighting
6. Low-resolution rendering
7. Jitter
8. Dither and quantisation
9. Glass
10. Car and ball art
11. Basic particles
12. Goal celebration
13. Menu presentation
14. Secondary detail

A/B presets:

```text
A = accepted
B = candidate
```

Calibration log template:

```md
## YYYY-MM-DD — Visual subsystem

### Hypothesis
What is wrong and why?

### Values before
...

### Values after
...

### Screenshots
...

### Readability
...

### Performance
...

### Decision
Accepted / Reverted / Revise
```

---

# 44. Human Playtest Rubric

Rate 1–5.

Visual identity:

- Original futuristic PSX identity
- Wipeout influence without copying
- Stadium feels suspended in space
- Arena silhouette memorable
- Teams distinct

Gameplay readability:

- Ball easy to track
- Opponent easy to identify
- Goals easy to locate
- Boundaries understandable
- Speed readable
- Goal effects do not hide play

UI:

- Match starts quickly
- Duration choice obvious
- Score and timer readable
- Boost readable
- Pause and results clear

Effects:

- Boost energetic
- Hits impactful
- Slide effects useful
- Goal rewarding
- Repeated matches not exhausting

Flow:

- Countdown fast enough
- Goal-to-kickoff timing appropriate
- Overtime understandable
- Results appear at right time
- Replay immediate

---

# 45. Common Failure Modes

## Stadium invisible

- Glass too transparent
- No opaque ribs
- Grid too fine
- Space too uniformly black
- Weak edges
- Transparency sorting issue

## Stadium too modern

- Too much smooth transmission
- Glossy reflections
- Clean curves
- No grit
- No segmentation
- No industrial structure

## PSX effect distracting

- Ball/car jitter too high
- Dither too strong
- Too few colour levels
- Resolution too low
- Thin geometry
- Shake stacking with jitter

## Generic neon look

- Too many saturated colours
- Insufficient dark metal
- No graphic markings
- No palette discipline
- Weak silhouettes

## Ball difficult to see

- Dim seams
- Similar floor value
- Dense trail
- Stars behind ball
- Opaque goal particles
- Highlight clipping

## Glass sorting errors

- Too many overlapping transparent meshes
- Incorrect depth-write
- One giant shell
- Camera outside enclosure
- Transparent ribs that should be opaque

## Duplicate goals

- Latch set too late
- Multiple sensor events
- Celebration state still allows scoring
- Reset fails to clear overlap

## Clock continues during celebration

- Clock updated outside PLAYING
- Multiple timers
- State transition delayed

## Match ends with airborne ball

- Zero-second state missing
- Wall contact counted as floor
- Floor threshold too high

## Overtime timer wrong

- Regulation and overtime clock shared incorrectly
- Wrong display selector
- Overtime using regulation path

---

# 46. Phased Implementation Plan

## Phase 0 — Contracts and deterministic flow

- Public types
- Physics adapter
- Stadium export interface
- Browser test API
- App and match states
- Deterministic ticks

Exit:

- Existing physics unchanged
- Menu and start-match callable
- States serialisable

## Phase 1 — Stadium blockout

- Field
- Goals
- Walls
- Ceiling
- Curves
- Spawns
- Sensors

Exit:

- Cars and ball contained
- Goal tests pass

## Phase 2 — Boost-pad layout and presentation

- Export 12 small and 4 full pads
- Build small/full low-poly visuals
- Bind active/inactive state to physics observations
- Add collection and respawn VFX
- Reset pads at kickoff

Exit:

- Physics and visuals agree on every pad.
- Pad layout is symmetrical and readable.
- Pickup and respawn tests pass.

## Phase 3 — Functional game loop

- Menu
- Setup
- Duration
- Countdown
- Match
- Goal
- Reset
- Clock
- Zero-second
- Overtime
- Results
- Replay
- Return

Exit:

- Playwright flow suite passes
- One-minute match completes automatically

## Phase 4 — Camera and HUD

- Chase camera
- Camera collision
- Score
- Timer
- Boost
- Countdown
- Goal banner

Exit:

- Ball and goals readable

## Phase 5 — Base art language

- Low-resolution target
- Nearest upscale
- Palette
- Placeholder low-poly assets
- Lighting
- Space background

## Phase 6 — PSX render pass

- Jitter
- Quantisation
- Bayer dither
- Presets
- Accessibility reductions

## Phase 7 — Stadium art

- Ribs
- Glass panels
- Floor markings
- Goals
- Floating base
- Exterior structure

## Phase 8 — Starfield

- Seeded three-layer field
- Pixel sprites
- Parallax
- Goal response

## Phase 9 — Core VFX

- Boost
- Jump
- Slide
- Ball hit
- Car hit
- Ball trail
- Pooling

## Phase 10 — Goal celebration

- Flash
- Shockwave
- Shards
- Arena pulse
- Star streak
- Banner
- Camera impulse

## Phase 11 — Menu and settings polish

- Live background
- Full settings
- Persistence
- Keyboard/gamepad navigation
- Pause and results polish

## Phase 12 — Aesthetic calibration

- Screenshot matrix
- A/B tests
- Playtest rubric
- Profiling
- Visual regression review

Exit:

- High-priority visual ratings average at least 4/5
- No major readability issue
- 60 FPS target met

---

# 47. Definition of Done

Visual language:

- [ ] Original futuristic PSX identity
- [ ] Low-resolution world
- [ ] Nearest upscale
- [ ] Configurable vertex jitter
- [ ] Dither and quantisation
- [ ] Low-poly assets
- [ ] Native-resolution UI
- [ ] Accessibility reductions

Stadium:

- [ ] Compact 1v1 size
- [ ] Two goals
- [ ] Goal sensors
- [ ] Symmetrical spawns
- [ ] Smooth physics transitions
- [ ] Floating-space presentation
- [ ] Textured transparent shell
- [ ] Structural ribs
- [ ] Field markings
- [ ] Pixel starfield
- [ ] Twelve small boost pads
- [ ] Four full boost pads
- [ ] Small/full pads visually distinct
- [ ] Pickup and respawn presentation
- [ ] Kickoff pad reset
- [ ] No escape seams

VFX:

- [ ] Car boost trail
- [ ] Boost-pad collection burst
- [ ] Boost-pad respawn effect
- [ ] Jump
- [ ] Powerslide
- [ ] Car-ball impact
- [ ] Car-car impact
- [ ] Ball trail
- [ ] Goal explosion
- [ ] Arena pulse
- [ ] Star response
- [ ] Particle pooling
- [ ] Reduced effects

UI:

- [ ] Main menu
- [ ] Play
- [ ] Settings
- [ ] Duration selector
- [ ] HUD
- [ ] Countdown
- [ ] Pause
- [ ] Goal banner
- [ ] Overtime
- [ ] Results
- [ ] Replay
- [ ] Return to menu
- [ ] Keyboard navigation
- [ ] Settings persistence

Game flow:

- [ ] 3-2-1-GO
- [ ] Control lock before GO
- [ ] 1/3/10 minute matches
- [ ] Goal latch
- [ ] Reset
- [ ] Zero-second rule
- [ ] Golden-goal overtime
- [ ] Results
- [ ] Replay
- [ ] Pause
- [ ] Deterministic state machine

Testing:

- [ ] Menu tests
- [ ] Duration tests
- [ ] Countdown tests
- [ ] Clock tests
- [ ] Goal tests
- [ ] Zero-second tests
- [ ] Overtime tests
- [ ] Replay tests
- [ ] Visual snapshots
- [ ] Stadium integration tests
- [ ] Boost-pad layout, pickup, respawn, and reset tests
- [ ] Particle stress tests
- [ ] Fixed presentation seed
- [ ] Calibration log

---

# 48. Deferred Decisions

Do not block initial implementation on:

- Final game title
- Logo
- Team names
- Final car silhouette
- Stadium name
- Music direction
- Final font
- AI difficulty
- Control rebinding
- Video replay
- Additional arenas
- Cosmetic selection
- Alternate kickoffs
- Announcer
- Detailed audio
- Advanced result statistics

---

# 49. Recommended Source Structure

```text
src/
├─ physics/                 # existing
├─ ai/                      # future
├─ stadium/
│  ├─ StadiumModule.ts
│  ├─ StadiumDefinition.ts
│  ├─ StadiumPhysicsExport.ts
│  ├─ StadiumVisual.ts
│  ├─ StadiumMaterials.ts
│  ├─ Starfield.ts
│  └─ DarkSpaceArena.ts
├─ visual-language/
│  ├─ VisualPreset.ts
│  ├─ PixelRenderPipeline.ts
│  ├─ VertexJitter.ts
│  ├─ DitherPass.ts
│  ├─ QuantisationPass.ts
│  ├─ GlowPass.ts
│  ├─ Palette.ts
│  └─ PsxMaterialFactory.ts
├─ vfx/
│  ├─ VfxModule.ts
│  ├─ ParticlePool.ts
│  ├─ BoostVfx.ts
│  ├─ JumpVfx.ts
│  ├─ SlideVfx.ts
│  ├─ ImpactVfx.ts
│  ├─ BallTrail.ts
│  └─ GoalCelebrationVfx.ts
├─ game-flow/
│  ├─ MatchFlowController.ts
│  ├─ MatchState.ts
│  ├─ MatchConfig.ts
│  ├─ MatchClock.ts
│  ├─ GoalController.ts
│  ├─ KickoffController.ts
│  ├─ OvertimeController.ts
│  └─ MatchFlowEvents.ts
├─ ui/
│  ├─ UiRouter.ts
│  ├─ FocusManager.ts
│  ├─ MainMenu.ts
│  ├─ MatchSetup.ts
│  ├─ SettingsScreen.ts
│  ├─ GameplayHud.ts
│  ├─ CountdownOverlay.ts
│  ├─ GoalOverlay.ts
│  ├─ PauseMenu.ts
│  ├─ ResultsScreen.ts
│  └─ SettingsStore.ts
├─ camera/
│  ├─ ChaseCamera.ts
│  ├─ MenuCamera.ts
│  ├─ CameraCollision.ts
│  └─ CameraImpulse.ts
├─ integration/
│  ├─ GameRuntime.ts
│  ├─ ModuleBindings.ts
│  └─ EventBindings.ts
└─ testing/
   ├─ BrowserGameTestApi.ts
   ├─ VisualScenarioRunner.ts
   └─ PresentationSeed.ts
```

---

# 50. Final Architecture

```text
MAIN MENU
   |
MATCH SETUP — choose 1/3/10
   |
3 -> 2 -> 1 -> GO
   |
Human -> player car       opponent car <- future AI
              \           /
               shared physics
                     |
            goal/contact events
                     |
       +-------------+-------------+
       |                           |
     GOAL                    CLOCK REACHES ZERO
       |                           |
 CELEBRATION              ZERO-SECOND PLAY
       |                    /                  RESET             MATCH END        OVERTIME
       |                                  |
   COUNTDOWN                          GOLDEN GOAL
                                           |
                                        RESULTS
                                  REPLAY / MAIN MENU
```

Visual stack:

```text
Native-resolution UI
        |
Nearest-upscaled low-resolution world
        |
Dither and colour quantisation
        |
Restrained glow
        |
PSX-jittered low-poly scene
        |
Textured transparent stadium
        |
Pixel starfield and dark space
```

The intended result is a compact, immediately playable 1v1 arcade game with:

- Wipeout-era futuristic energy
- Original PSX visual identity
- Clear Rocket-League-like match flow
- Dark glass arena in space
- High-impact but readable particles
- Fast menu-to-match flow
- Golden-goal drama
- Architecture that can be refined without changing physics
