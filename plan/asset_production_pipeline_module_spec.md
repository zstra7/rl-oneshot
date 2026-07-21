# Asset Production and Procedural Content Pipeline Specification

**Document version:** 1.1  
**Module ID:** `ASSET_PIPELINE`  
**Primary audience:** A Sonnet-level coding LLM implementing the project with minimal human intervention  
**Runtime:** Browser, local 1v1  
**Language:** TypeScript  
**Rendering:** Three.js / WebGL  
**Required Three.js guidance:** Project-local `CloudAI-X/threejs-skills` skill files  
**Provided authored 3D assets:** Car models in GLB format  
**Provided authored image assets:** Project texture library  
**All other visual content:** Generated programmatically  
**Physics dependency:** `PHYSICS_MODULE_CONTRACT_VERSION = "2.1"` or later  
**Visual/game-flow dependency:** `VISUAL_GAMEFLOW_CONTRACT_VERSION = "1.1"` or later  
**Input dependency:** `INPUT_CONTROLS` version 1.0 or later  
**Automated browser testing:** Playwright Test  
**Primary objective:** Make the game visually complete without requiring any imported models besides the supplied cars or any imported images besides the supplied textures

---

# 0. Instructions to the Implementing LLM

Read the entire document before changing code.

Follow these rules:

1. The user supplies the car GLB files.
2. The user supplies the texture files.
3. Do not download or generate additional external models.
4. Do not download stock stadium assets.
5. Do not download a ball model.
6. Do not download boost-pad models.
7. Do not download particle sprite packs.
8. Do not download skyboxes or HDR environments.
9. Do not download UI icon packs.
10. Do not download fonts unless the user later explicitly supplies or approves one.
11. Do not make runtime requests to remote asset hosts.
12. All non-car geometry must be created programmatically.
13. All non-supplied image content must be created using code, shaders, `CanvasTexture`, `DataTexture`, inline SVG, or CSS.
14. Use Three.js for all Three.js rendering, geometry, material, texture, loader, shader, animation, post-processing, and scene-hierarchy work.
15. Before implementing a Three.js subsystem, read the relevant project-local Three.js skill.
16. Do not rely on memory when a matching Three.js skill exists.
17. The installed Three.js package types and compiler remain authoritative if a skill example differs from the installed version.
18. Do not silently introduce a second 3D engine.
19. Do not silently introduce React Three Fiber, Babylon.js, PlayCanvas, Unity exports, or a procedural modelling service.
20. Do not use Blender as a required build step for generated content.
21. Do not rewrite or destructively modify the user's source GLB files.
22. Normalise car visuals through an adapter hierarchy.
23. Keep authored source assets separate from runtime-generated content.
24. Keep asset manifests explicit and typed.
25. Every required asset must have a validation rule.
26. Every optional asset must have a fallback.
27. Production builds must never show silent missing-texture white materials.
28. Development fallbacks must be visually obvious.
29. Use deterministic seeds for all procedural content.
30. The same seed and configuration must produce the same geometry and star placement.
31. Do not use `Math.random()` in procedural asset factories.
32. Reuse geometry and materials.
33. Use instancing for repeated stadium pieces, stars, shards, lights, and pad details where appropriate.
34. Pool transient VFX objects.
35. Do not construct new geometry every frame.
36. Do not construct new materials every frame.
37. Do not load the same GLB or texture more than once.
38. Cache source resources and clone instances safely.
39. Dispose GPU resources deliberately.
40. Do not dispose shared resources while live instances still use them.
41. Do not use visual meshes as physics colliders.
42. Do not derive authoritative gameplay dimensions from arbitrary GLB bounds.
43. Physics dimensions remain authoritative.
44. The car GLB must be visually aligned to the existing physics hitbox.
45. Generated stadium geometry must follow the stadium specification.
46. Generated boost-pad visuals must follow authoritative physics pad definitions.
47. Generated ball geometry must follow the authoritative ball radius.
48. Generated particle effects must be event-driven.
49. UI remains native-resolution DOM/CSS where specified.
50. UI decorations and icons must be generated in code.
51. The PSX render pipeline remains separate from native-resolution UI.
52. The pipeline must work from a clean checkout after the user places the required files in documented locations.
53. Do not require a developer to manually edit generated files after every build.
54. Add Playwright asset and visual-regression tests.
55. Add validation scripts that fail with actionable messages.
56. Keep a machine-readable asset report.
57. Keep an asset-attribution file for user-supplied content.
58. Record deviations in `docs/asset-pipeline-deviations.md`.
59. Record procedural visual tuning in `docs/procedural-asset-calibration-log.md`.
60. The module is complete only when a clean build can produce the entire visual game from the supplied cars, supplied textures, and source code.

---

# 1. Pipeline Goal

Create a predictable content pipeline with only two authored-input categories:

```text
User-supplied GLB cars
+
User-supplied texture files
```

Everything else is generated by the project:

```text
Stadium
Ball
Goals
Goal grids
Glass shell
Floor panels
Field markings
Structural ribs
Floating platform
Boost pads
Starfield
Particles
Trails
Shockwaves
Menu presentation objects
Debug geometry
Fallback visuals
UI icons and decorations
Procedural texture masks
PSX post-processing resources
```

The pipeline must make it possible for Claude Code to:

1. Inspect the available files.
2. Validate them.
3. Load them correctly.
4. Generate the missing world.
5. Bind everything to physics and game flow.
6. Produce stable screenshots.
7. Diagnose failures without guessing.

---

# 2. Three.js Skills Requirement

The project will contain the `CloudAI-X/threejs-skills` skill collection.

The skill collection defines focused guidance for:

```text
threejs-fundamentals
threejs-geometry
threejs-materials
threejs-lighting
threejs-textures
threejs-animation
threejs-loaders
threejs-shaders
threejs-postprocessing
threejs-interaction
```

## 2.1 Required project location

Claude Code must be able to discover the skills under:

```text
.claude/skills/
```

Expected:

```text
.claude/skills/threejs-fundamentals/SKILL.md
.claude/skills/threejs-geometry/SKILL.md
.claude/skills/threejs-materials/SKILL.md
.claude/skills/threejs-lighting/SKILL.md
.claude/skills/threejs-textures/SKILL.md
.claude/skills/threejs-animation/SKILL.md
.claude/skills/threejs-loaders/SKILL.md
.claude/skills/threejs-shaders/SKILL.md
.claude/skills/threejs-postprocessing/SKILL.md
.claude/skills/threejs-interaction/SKILL.md
```

If the repository is vendored elsewhere, copy or expose the skill directories at this path.

Do not fetch them at runtime.

## 2.2 Validation script

Create:

```text
scripts/validate-threejs-skills.mjs
```

It verifies all ten files exist.

Failure message example:

```text
Missing required Three.js Claude skill:
.claude/skills/threejs-geometry/SKILL.md

Install the project-approved CloudAI-X/threejs-skills files
before asking Claude Code to implement procedural geometry.
```

Run this validation in:

- `npm run validate`
- CI
- The main implementation prompt before substantial Three.js generation

## 2.3 Skill usage matrix

| Work | Required skills |
|---|---|
| Scene hierarchy and coordinates | `threejs-fundamentals` |
| Procedural meshes and instancing | `threejs-geometry` |
| Material selection and reuse | `threejs-materials` |
| Lights and shadow budgets | `threejs-lighting` |
| Supplied textures and generated textures | `threejs-textures` |
| GLB loading and animation clips | `threejs-loaders`, `threejs-animation` |
| Vertex jitter and procedural materials | `threejs-shaders` |
| Dither, quantisation, glow, pixel output | `threejs-postprocessing`, `threejs-shaders` |
| Development object selection | `threejs-interaction` |

## 2.4 Mandatory implementation behaviour

Before changing one of these systems, Claude must:

1. Open the relevant `SKILL.md`.
2. Use its import conventions and API patterns.
3. Check the installed Three.js version.
4. Check TypeScript definitions.
5. Compile.
6. Run the relevant Playwright test.
7. Record an implementation note if deviating.

## 2.5 Skill usage log

Maintain:

```text
docs/threejs-skill-usage-log.md
```

Template:

```md
## Stadium glass implementation

Skills read:
- threejs-materials
- threejs-shaders
- threejs-textures

Installed Three.js version:
- x.y.z

Patterns used:
- Shared material registry
- Shader uniforms
- Data texture mask

Deviations:
- None
```

This log prevents an implementation model from ignoring the repository skills.

---

# 3. Source-of-Truth Hierarchy

When guidance conflicts, use:

```text
1. This game's module specifications
2. Installed Three.js TypeScript definitions
3. Installed Three.js source/addons
4. Project-local threejs-skills
5. Official Three.js documentation
6. General model memory
```

The skills are mandatory implementation guidance.

They do not override:

- Physics dimensions
- Stadium dimensions
- Art direction
- Performance budgets
- User-provided asset constraints

---

# 4. Asset Categories

```ts
export type AssetOrigin =
  | "user-glb"
  | "user-texture"
  | "procedural-geometry"
  | "procedural-texture"
  | "shader"
  | "dom-css"
  | "inline-svg";
```

Allowed runtime sources:

| Category | Allowed |
|---|---|
| Supplied car GLB | Yes |
| Supplied texture files | Yes |
| Procedural Three.js geometry | Yes |
| Canvas/Data textures | Yes |
| GLSL shaders | Yes |
| DOM/CSS UI | Yes |
| Inline SVG UI decoration | Yes |
| Downloaded model | No |
| Downloaded image | No |
| Remote CDN asset | No |
| Remote font | No |
| Runtime model generator | No |
| Runtime image-generation API | No |

---

# 5. Earlier-Specification Amendments

This module supersedes earlier assumptions that implied other authored assets.

The following are no longer required:

- Bundled font file
- Imported ball model
- Imported stadium model
- Imported boost-pad model
- Imported star texture
- Imported particle texture
- Imported goal-net texture
- Imported UI icon set
- Imported HDRI
- Imported cubemap
- Imported skybox
- Imported menu-scene model

Use instead:

| Need | Replacement |
|---|---|
| Font | System/CSS stack unless user later supplies one |
| Ball | Procedural `IcosahedronGeometry` |
| Stadium | Procedural geometry factories |
| Stars | Procedural `BufferGeometry` / instancing |
| Particles | Procedural quads, triangles, strips, points |
| Icons | CSS and inline SVG |
| Goal grid | Shader or generated canvas/data texture |
| Environment | Dark colour, procedural stars, simple lighting |
| Field markings | Procedural geometry or `CanvasTexture` |
| Dither matrix | `DataTexture` or shader constant |

---

# 6. Project Directory Structure

```text
/
├─ .claude/
│  └─ skills/
│     ├─ threejs-fundamentals/
│     ├─ threejs-geometry/
│     ├─ threejs-materials/
│     ├─ threejs-lighting/
│     ├─ threejs-textures/
│     ├─ threejs-animation/
│     ├─ threejs-loaders/
│     ├─ threejs-shaders/
│     ├─ threejs-postprocessing/
│     └─ threejs-interaction/
│
├─ public/
│  └─ assets/
│     ├─ cars/
│     │  ├─ player-car.glb
│     │  └─ opponent-car.glb
│     │
│     └─ textures/
│        ├─ stadium/
│        ├─ car/
│        ├─ surface/
│        ├─ glass/
│        ├─ effects/
│        └─ misc/
│
├─ src/
│  ├─ assets/
│  │  ├─ index.ts
│  │  ├─ AssetPipeline.ts
│  │  ├─ AssetManifest.ts
│  │  ├─ AssetTypes.ts
│  │  ├─ AssetPaths.ts
│  │  ├─ AssetLoadingManager.ts
│  │  ├─ AssetCache.ts
│  │  ├─ AssetValidation.ts
│  │  ├─ AssetReport.ts
│  │  ├─ ResourceOwnership.ts
│  │  ├─ ResourceDisposer.ts
│  │  │
│  │  ├─ cars/
│  │  │  ├─ CarAssetDescriptor.ts
│  │  │  ├─ CarAssetLoader.ts
│  │  │  ├─ CarAssetInspector.ts
│  │  │  ├─ CarAssetNormalizer.ts
│  │  │  ├─ CarMaterialAdapter.ts
│  │  │  ├─ CarVisualFactory.ts
│  │  │  └─ ProceduralCarFallback.ts
│  │  │
│  │  ├─ textures/
│  │  │  ├─ TextureManifest.ts
│  │  │  ├─ TextureRegistry.ts
│  │  │  ├─ TextureConfigurator.ts
│  │  │  ├─ ProceduralTextureFactory.ts
│  │  │  └─ MissingTextureFallback.ts
│  │  │
│  │  ├─ procedural/
│  │  │  ├─ SeededRandom.ts
│  │  │  ├─ ProceduralAssetContext.ts
│  │  │  ├─ GeometryRegistry.ts
│  │  │  ├─ MaterialRegistry.ts
│  │  │  ├─ StadiumGeometryFactory.ts
│  │  │  ├─ BallVisualFactory.ts
│  │  │  ├─ GoalVisualFactory.ts
│  │  │  ├─ BoostPadVisualFactory.ts
│  │  │  ├─ StarfieldFactory.ts
│  │  │  ├─ ParticleGeometryFactory.ts
│  │  │  ├─ FieldMarkingFactory.ts
│  │  │  └─ MenuPresentationFactory.ts
│  │  │
│  │  ├─ shaders/
│  │  │  ├─ ShaderLibrary.ts
│  │  │  ├─ VertexJitterChunk.ts
│  │  │  ├─ GlassShader.ts
│  │  │  ├─ GoalGridShader.ts
│  │  │  ├─ ParticleShader.ts
│  │  │  └─ StarfieldShader.ts
│  │  │
│  │  └─ testing/
│  │     ├─ BrowserAssetTestApi.ts
│  │     ├─ AssetFixtureManifest.ts
│  │     └─ AssetVisualScenarios.ts
│  │
│  └─ ...
│
├─ scripts/
│  ├─ validate-threejs-skills.mjs
│  ├─ validate-assets.mjs
│  ├─ report-glb.mjs
│  ├─ report-textures.mjs
│  └─ create-asset-report.mjs
│
├─ docs/
│  ├─ asset-attribution.md
│  ├─ car-intake-report.md
│  ├─ texture-intake-report.md
│  ├─ asset-pipeline-deviations.md
│  ├─ procedural-asset-calibration-log.md
│  └─ threejs-skill-usage-log.md
│
└─ tests/
   ├─ assets/
   ├─ procedural/
   └─ visual/
```

If the player and opponent use one shared car file, the manifest may point both descriptors to the same GLB.

---

# 7. Asset Manifest

Create a typed manifest.

```ts
export interface GameAssetManifest {
  schemaVersion: 1;

  cars: {
    player: CarAssetDescriptor;
    opponent: CarAssetDescriptor;
  };

  textures: Record<TextureAssetId, TextureAssetDescriptor>;

  procedural: ProceduralAssetManifest;
}
```

The manifest must be code or validated JSON imported through code.

Do not infer critical car orientation or team-material names every startup.

---

# 8. Asset Pipeline Lifecycle

```ts
export type AssetPipelineState =
  | "IDLE"
  | "VALIDATING_SKILLS"
  | "VALIDATING_MANIFEST"
  | "LOADING_AUTHORED_ASSETS"
  | "VALIDATING_AUTHORED_ASSETS"
  | "BUILDING_PROCEDURAL_RESOURCES"
  | "WARMING_SHADERS"
  | "READY"
  | "FAILED";
```

Pipeline order:

1. Validate Three.js skill installation.
2. Validate manifest schema.
3. Start shared `THREE.LoadingManager`.
4. Load required car GLBs.
5. Load supplied required textures.
6. Inspect and validate cars.
7. Configure textures.
8. Build shared procedural geometries.
9. Build material registry.
10. Build generated textures.
11. Compile/warm critical shaders.
12. Generate asset report.
13. Enter `READY`.

Do not start a match before required assets are ready.

The menu may show a loading presentation.

---

# 9. Loading Manager

Use one project-owned loading manager.

```ts
export class AssetLoadingManager {
  readonly manager: THREE.LoadingManager;

  getProgress(): AssetLoadProgress;
  getErrors(): readonly AssetLoadError[];
}
```

```ts
export interface AssetLoadProgress {
  loaded: number;
  total: number;
  ratio: number;

  currentUrl: string | null;
  phase: AssetPipelineState;
}
```

Use the manager for:

- `GLTFLoader`
- `TextureLoader`
- Optional local Draco decoder resources
- Optional local KTX2 transcoder resources

Do not have unrelated loaders with independent progress counters.

---

# 10. Runtime Network Policy

Production runtime may request only files included in the built project.

Allowed examples:

```text
/assets/cars/player-car.glb
/assets/cars/opponent-car.glb
/assets/textures/stadium/metal.png
```

Forbidden:

```text
https://some-model-site.example/model.glb
https://cdn.example/particle.png
https://fonts.example/font.woff2
```

Add a Playwright network test that fails if an asset request uses a non-local origin.

NPM JavaScript chunks are part of the build, not runtime asset downloads.

---

# 11. Supplied Car GLB Contract

## 11.1 Required file properties

Preferred:

- GLB 2.0
- Self-contained binary file
- Y-up
- Reasonable origin
- No embedded cameras required
- No embedded lights required
- No absolute filesystem references
- No external texture URI required
- No scripts
- No unsupported extensions
- Mesh hierarchy preserved

The pipeline must still normalise orientation and scale through configuration.

## 11.2 Supported compression

Support where needed:

- Uncompressed GLB
- Draco-compressed geometry
- Meshopt-compressed geometry
- KTX2 textures embedded or referenced locally

Only configure a decoder if the supplied file actually needs it.

Decoder/transcoder files must be local.

Do not use a Google/CDN decoder path in production.

## 11.3 Car descriptor

```ts
export interface CarAssetDescriptor {
  id: "player-car" | "opponent-car";

  url: string;

  expectedForwardAxis:
    | "+X" | "-X"
    | "+Y" | "-Y"
    | "+Z" | "-Z";

  expectedUpAxis:
    | "+X" | "-X"
    | "+Y" | "-Y"
    | "+Z" | "-Z";

  visualScale: number;

  visualOffset: Vec3Data;
  visualRotationEuler: Vec3Data;

  teamTintTargets: readonly MaterialTargetRule[];

  wheelNodes?: {
    frontLeft?: string;
    frontRight?: string;
    rearLeft?: string;
    rearRight?: string;
  };

  boostSockets?: readonly NodeSocketDescriptor[];

  shadowMode: "none" | "receive" | "cast-receive";

  required: true;
}
```

## 11.4 Source protection

Never:

- Overwrite supplied GLB
- Export a modified copy as the new source without user approval
- Rename internal nodes automatically
- Bake runtime team colours into the source file
- Strip source materials destructively

Runtime adapters wrap or clone source content.

---

# 12. Car Loading

Use a cached `GLTFLoader`.

```ts
export class CarAssetLoader {
  loadSource(
    descriptor: CarAssetDescriptor
  ): Promise<LoadedCarSource>;

  createInstance(
    descriptor: CarAssetDescriptor,
    team: TeamVisualProfile
  ): THREE.Object3D;
}
```

Cache by URL.

If one GLB is used for both cars:

- Load once.
- Clone twice.
- Clone materials where team-specific mutation is required.
- Continue sharing geometry and immutable textures.

For skinned meshes:

- Use the approved Three.js skeleton-cloning pattern.
- Read `threejs-animation` and `threejs-loaders`.
- Do not use shallow `Object3D.clone()` if skeleton independence would break.

---

# 13. Car Intake Inspection

Create a development inspector that reports:

```ts
export interface CarAssetInspectionReport {
  url: string;

  nodeCount: number;
  meshCount: number;
  skinnedMeshCount: number;
  materialCount: number;
  textureCount: number;

  triangleCount: number;
  vertexCount: number;

  sourceBounds: {
    min: Vec3Data;
    max: Vec3Data;
    size: Vec3Data;
    centre: Vec3Data;
  };

  animationClips: {
    name: string;
    duration: number;
    trackCount: number;
  }[];

  nodeNames: string[];
  materialNames: string[];

  extensionUsage: string[];
  warnings: string[];
  errors: string[];
}
```

Write a human-readable report to:

```text
docs/car-intake-report.md
```

The runtime may display the report in an asset lab.

---

# 14. Car Validation

## 14.1 Required checks

Fail production validation if:

- File missing
- Loader error
- No mesh
- Non-finite bounds
- Zero-size bounds
- Unsupported mandatory extension
- Required team-tint target missing
- Duplicate descriptor ID
- Declared wheel node missing when marked required
- Declared boost socket missing when marked required

## 14.2 Warnings

Warn if:

- More than 50,000 triangles
- More than 32 materials
- More than 16 unique textures
- Texture dimension above 2048
- Embedded camera
- Embedded light
- Animation clips unused
- Source transform has extreme scale
- Mesh extends far outside visual bounds
- Materials use expensive transmission or clearcoat unexpectedly

Recommended target:

```text
1,200–10,000 triangles per car
```

The earlier 1,200–2,000 triangle goal remains the ideal PSX target, but the pipeline should not silently destroy a user-provided model that exceeds it.

## 14.3 No automatic decimation

Three.js is not the model-reduction authoring tool.

If the supplied car is too heavy:

1. Report exact counts.
2. Continue in development if below hard safety limit.
3. Fail production only if the configured hard limit is exceeded.
4. Ask for an optimised GLB later.

Do not implement an unreliable runtime triangle reducer.

---

# 15. Car Normalisation Hierarchy

Use:

```text
CarPhysicsRoot
└─ CarVisualOffset
   └─ CarTeamVisualRoot
      └─ LoadedGlbScene
```

Responsibilities:

## CarPhysicsRoot

- Receives interpolated physics transform
- Scale `(1,1,1)`
- No authored rotation correction
- No team material mutation

## CarVisualOffset

- Applies descriptor scale
- Applies source-axis correction
- Applies source-origin offset
- Aligns GLB to physics hitbox

## CarTeamVisualRoot

- Contains team-specific cloned materials
- Contains VFX sockets
- Contains optional wheel visual controllers

Do not scale `CarPhysicsRoot`.

---

# 16. Car-to-Physics Alignment

Authoritative physics dimensions:

```text
Length: 1.1801 m
Width: 0.8420 m
Height: 0.3616 m
```

The visual car does not need to exactly fill the OBB, but should closely correspond.

Create a development alignment scene:

- Physics OBB wireframe
- Loaded car
- Local axes
- Wheel probe positions
- Ground plane
- Nose direction
- Boost socket
- Camera presets

Expose descriptor controls through a development panel:

- Scale
- X/Y/Z offset
- X/Y/Z rotation

After alignment:

- Save values in descriptor code.
- Do not rely on runtime GUI values.

Playwright captures:

- Side view
- Front view
- Top view
- Chase view
- Wheel-probe view

---

# 17. Car Material Adaptation

Do not assume source materials already match team colours.

Use explicit target rules.

```ts
export interface MaterialTargetRule {
  matchBy:
    | { materialName: string }
    | { materialNamePattern: string }
    | { nodeName: string };

  role:
    | "team-primary"
    | "team-secondary"
    | "neutral-body"
    | "glass"
    | "wheel"
    | "emissive"
    | "untouched";

  required: boolean;
}
```

Team profile:

```ts
export interface TeamVisualProfile {
  teamId: "player" | "opponent";

  primary: THREE.ColorRepresentation;
  secondary: THREE.ColorRepresentation;
  emissive: THREE.ColorRepresentation;

  patternId: string;
}
```

## 17.1 Material cloning

Clone only materials that need instance-specific changes.

Continue sharing:

- Geometry
- Immutable maps
- Neutral immutable materials where safe

Do not mutate a cached source material and accidentally recolour both cars.

## 17.2 Source material simplification

The runtime adapter may replace expensive materials with project materials if configured.

Example:

```ts
role === "team-primary"
-> PsxMaterialFactory.createCarBodyMaterial(...)
```

Preserve source maps where useful.

Do not silently preserve unsupported transmission or extremely expensive material settings.

---

# 18. Wheel Visuals

Wheel animation is visual only.

If wheel nodes are supplied:

- Rotate around configured local axle.
- Apply visual steering to front wheels.
- Use physics velocity to estimate spin.
- Do not drive physics from wheel animation.

If wheel nodes are absent:

- Leave the source model unchanged.
- Do not generate separate wheels over the model unless clearly required.
- A car without animated wheels remains valid.

---

# 19. Car Animation Clips

Animation clips are optional.

Potential allowed uses:

- Subtle idle panel
- Suspension visual detail
- Decorative emissive pulse

Do not use clips for:

- Car translation
- Car physics rotation
- Jumping
- Dodging
- Collision reaction

If clips exist:

1. Report them.
2. Use only explicitly configured clips.
3. Create one `AnimationMixer` per independent animated instance.
4. Dispose mixers/actions on teardown.

---

# 20. Car Fallback

Development and automated tests need a fallback if a user GLB has not yet been placed.

Create a procedural placeholder from boxes, wedges, and cylinders.

The placeholder:

- Matches approximate physics dimensions
- Shows forward direction
- Shows team colour
- Has four simple wheels
- Has a boost socket
- Is clearly labelled in debug state as fallback

Production policy:

```text
Required car missing -> fail asset pipeline
```

Do not ship the fallback as if it were the user's final car unless explicitly permitted.

---

# 21. Supplied Texture Contract

The user supplies textures.

Accepted initial formats:

- PNG
- JPG/JPEG
- WebP
- Optional KTX2 if the loader is configured locally

Preferred:

- Power-of-two dimensions
- 16–512 px for pixel/stylised textures
- Up to 1024 px for large surface atlases
- 2048 px hard warning threshold

No remote URLs.

---

# 22. Texture Manifest

```ts
export type TextureAssetId = string;

export type TextureSemantic =
  | "color"
  | "emissive"
  | "normal"
  | "roughness"
  | "metalness"
  | "ao"
  | "alpha"
  | "mask"
  | "height"
  | "noise"
  | "ui-color";

export interface TextureAssetDescriptor {
  id: TextureAssetId;
  url: string;

  semantic: TextureSemantic;

  required: boolean;

  filtering:
    | "pixel"
    | "pixel-mipmapped"
    | "surface"
    | "data";

  wrapS:
    | "clamp"
    | "repeat"
    | "mirror";

  wrapT:
    | "clamp"
    | "repeat"
    | "mirror";

  repeat: {
    x: number;
    y: number;
  };

  flipY: boolean;

  expectedAspectRatio?: number;
  maximumDimension?: number;

  attributionId?: string;
}
```

Do not discover texture semantics solely from filename.

The filename may assist report generation, but manifest is authoritative.

---

# 23. Texture Colour Space

Required:

```text
Color/albedo/emissive/UI colour -> THREE.SRGBColorSpace
Normal/roughness/metalness/AO/mask/height/noise -> NoColorSpace
```

Do not set sRGB on data maps.

For textures loaded inside GLB:

- Let `GLTFLoader` configure expected glTF texture behaviour.
- Do not blindly reapply external-texture `flipY` rules.

For externally supplied textures attached to glTF-derived materials:

- Follow descriptor `flipY`.
- Common glTF-compatible external-map use may require `flipY = false`.

---

# 24. Texture Filtering Profiles

## Pixel

```ts
magFilter = THREE.NearestFilter;
minFilter = THREE.NearestFilter;
generateMipmaps = false;
```

Use for:

- Particle sprites
- Small graphic masks
- Pixel UI canvases
- Dither resources
- Small decals viewed close

## Pixel mipmapped

```ts
magFilter = THREE.NearestFilter;
minFilter = THREE.NearestMipmapNearestFilter;
generateMipmaps = true;
```

Use for:

- Repeating field textures
- Stadium panels
- Floor details that alias badly at distance

## Surface

```ts
magFilter = THREE.LinearFilter;
minFilter = THREE.LinearMipmapLinearFilter;
generateMipmaps = true;
```

Use only when supplied art requires smoother filtering and PSX output remains acceptable.

## Data

Use filtering appropriate to the data:

- Normal maps generally linear
- Hard masks may use nearest
- No sRGB

Keep anisotropy low in authentic mode.

High anisotropy may undermine the intended retro texture character.

---

# 25. Texture Intake Report

Create:

```text
docs/texture-intake-report.md
```

For each file:

- Path
- Dimensions
- Format
- Semantic
- Required/optional
- Colour space
- Filtering
- Wrapping
- Repeat
- Approximate GPU memory
- Alpha presence
- Warnings
- Materials that use it

Fail if:

- Required texture missing
- Decode fails
- Zero dimensions
- Exceeds configured hard limit
- Manifest ID duplicated

Warn if:

- Non-power-of-two where mipmaps expected
- Alpha channel unused
- Colour texture lacks sRGB configuration
- Data texture incorrectly marked sRGB
- Very large texture
- Extreme aspect ratio

---

# 26. Texture Fallbacks

Required texture missing:

- Development: obvious magenta/black checker `CanvasTexture`
- Production: fail asset pipeline

Optional texture missing:

- Use semantic fallback

Examples:

```text
colour -> white
normal -> flat normal
roughness -> scalar material value
metalness -> scalar value
mask -> white or black according to role
noise -> procedural noise DataTexture
```

Fallback resources are shared.

Do not generate one checker texture per missing asset.

---

# 27. Attribution

Maintain:

```text
docs/asset-attribution.md
```

For each user-supplied asset:

```md
## Asset ID

Type:
Source file:
Provided by:
Licence/status:
Modification policy:
Used by:
Notes:
```

The pipeline cannot infer legal rights.

The user or project owner supplies attribution/licence information.

Do not publish third-party files without recorded permission.

The Three.js skills repository itself is an implementation aid, not a shipped visual asset.

---

# 28. Deterministic Procedural Generation

Create one seedable PRNG.

```ts
export interface ProceduralRandom {
  nextFloat(): number;
  range(min: number, max: number): number;
  integer(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
}
```

Never use `Math.random()` in generated content.

Seed sources:

```ts
export interface ProceduralSeeds {
  stadium: number;
  starfield: number;
  menuScene: number;
  ambientParticles: number;
  goalCelebration: number;
  testPresentation: number;
}
```

Fixed standard stadium seeds belong in configuration.

Transient VFX may derive sub-seeds from:

```text
base seed
+ event tick
+ entity ID
+ event sequence
```

This keeps screenshots repeatable.

---

# 29. Procedural Asset Context

```ts
export interface ProceduralAssetContext {
  three: typeof THREE;

  geometryRegistry: GeometryRegistry;
  materialRegistry: MaterialRegistry;
  textureRegistry: TextureRegistry;

  random: ProceduralRandom;

  visualPreset: VisualPreset;
  stadiumDefinition: StadiumDefinition;

  physicsMetadata: {
    ballRadius: number;
    carHitboxSize: Vec3Data;
    boostPads: readonly BoostPadDefinition[];
  };
}
```

Factories must receive context.

Do not import global mutable renderer state from arbitrary modules.

---

# 30. Geometry Registry

```ts
export class GeometryRegistry {
  getOrCreate(
    key: string,
    factory: () => THREE.BufferGeometry
  ): THREE.BufferGeometry;

  retain(key: string): void;
  release(key: string): void;

  disposeUnused(): void;
  disposeAll(): void;
}
```

Use stable keys:

```text
stadium-floor-panel-v1
stadium-rib-v1
ball-faceted-v1
boost-small-ring-v1
particle-shard-triangle-v1
```

Repeated objects share geometry.

---

# 31. Material Registry

```ts
export class MaterialRegistry {
  getOrCreate<T extends THREE.Material>(
    key: string,
    factory: () => T
  ): T;

  createInstanceMaterial<T extends THREE.Material>(
    sourceKey: string,
    instanceKey: string,
    mutate: (material: T) => void
  ): T;

  disposeAll(): void;
}
```

Do not create one material per floor panel.

Share by:

- Team
- Surface type
- Jitter strength
- Transparency category
- VFX type

Be cautious: differing `onBeforeCompile` defines may require separate material keys.

---

# 32. Procedural Stadium Construction

The stadium is generated from dimensions and modules.

Recommended hierarchy:

```text
StadiumVisualRoot
├─ FieldRoot
│  ├─ FloorBase
│  ├─ FloorPanels
│  ├─ FieldMarkings
│  └─ BoostPads
├─ GoalRootPlayer
├─ GoalRootOpponent
├─ StructuralRoot
│  ├─ SideRibs
│  ├─ RoofRibs
│  ├─ CornerRibs
│  └─ ExternalSupports
├─ GlassRoot
│  ├─ SidePanels
│  ├─ RoofPanels
│  └─ EndPanels
├─ FloatingBaseRoot
├─ LightingAccentRoot
└─ DebugSockets
```

Generated render geometry is not the physics collider source.

Both are generated from the same high-level dimensions, but through separate factories.

---

# 33. Stadium Dimension Inputs

Use the stadium module values:

```ts
interface StadiumGenerationDimensions {
  fieldLength: number;
  fieldWidth: number;
  interiorHeight: number;

  goalWidth: number;
  goalHeight: number;
  goalDepth: number;

  cornerRadius: number;
  floorWallTransitionRadius: number;
  wallCeilingTransitionRadius: number;
}
```

Do not hardcode duplicate numbers throughout geometry files.

One standard definition feeds:

- Visual factory
- Physics arena factory
- AI arena description
- Camera limits
- Test assertions

---

# 34. Floor Generation

Create:

1. Base field slab
2. Low-poly panel overlay
3. Field markings
4. Boost-pad recesses
5. Goal-mouth transition panels

Use:

- `PlaneGeometry`
- `BoxGeometry`
- Custom `BufferGeometry`
- `InstancedMesh`

Floor panel layout:

- Large rectangles
- Controlled irregular seams
- Symmetrical gameplay markings
- Deterministic decorative variation

Do not generate tiny geometry below pixel visibility.

Avoid z-fighting:

- Use small explicit offsets
- Or merge markings into a generated texture
- Do not stack coplanar planes without depth strategy

---

# 35. Field Markings

Generate with one of:

- Thin box strips
- Custom flat `BufferGeometry`
- `CanvasTexture` atlas
- Shader mask

Required:

- Centre line
- Centre circle
- Goal-box framing
- Half accents
- Kickoff markers
- Goal chevrons

Preferred for stable PSX output:

- Broad geometry strips
- Low-segment circle
- Minimal anti-aliasing dependence

The centre circle should be visibly faceted rather than perfectly smooth.

---

# 36. Structural Ribs

Use repeated low-poly rib modules.

Factory:

```ts
createStadiumRibGeometry(
  parameters: StadiumRibParameters
): THREE.BufferGeometry;
```

Use:

- Box/extruded profile
- 4–8 bevel/curve segments maximum where needed
- `InstancedMesh` for repeated ribs

Store per-instance:

- Transform
- Optional colour variation
- Team-side accent
- Pulse phase

Do not create hundreds of separate meshes.

---

# 37. Curved Visual Transitions

Physics uses smooth collision transitions.

Visual transitions can be faceted.

Generate quarter curves with custom `BufferGeometry`.

Parameters:

- Radius
- Arc start/end
- Segment count
- Width
- Panel divisions

Recommended visible segment count:

```text
6–12 segments per quarter curve
```

The faceting supports PSX style.

Ensure visual surface approximately matches collision shell.

---

# 38. Glass Panels

Glass is procedurally constructed from:

- Panel geometry
- Supplied texture where appropriate
- Generated grid/mask
- Shared shader/material
- Opaque frames

Do not use one complex imported shell.

## 38.1 Panel factory

```ts
interface GlassPanelParameters {
  width: number;
  height: number;

  gridScale: number;
  scratchTextureId?: TextureAssetId;

  tint: THREE.ColorRepresentation;
  opacity: number;

  jitterStrength: number;
}
```

## 38.2 Layering

```text
Panel tint mesh
+ grid/emissive layer
+ opaque frame geometry
```

Use alpha test where possible.

Reduce overlapping transparent surfaces.

## 38.3 Generated grid

Generate grid using:

- Fragment shader
- `CanvasTexture`
- `DataTexture`

Do not require a grid image file.

## 38.4 Supplied textures

Supplied scratch/noise textures may modulate:

- Alpha
- Roughness appearance
- Edge disturbance
- Grid intensity

The glass remains functional without them through procedural fallback.

---

# 39. Goals

Generate goals from primitives and custom geometry.

Components:

- Goal frame
- Goal interior
- Holographic grid/net
- Goal-floor details
- Team-colour lighting strips
- VFX sockets

Goal frame:

- Boxes/extruded angular tubes
- Low segment count
- Shared geometry for both ends
- Team-specific material instance

Goal grid:

- Shader or generated texture
- Animated scan phase
- Depth bands
- Transparent enough to see ball

Do not require a net mesh asset.

---

# 40. Floating Platform

Generate:

- Base slab
- Underside wedges
- Fins
- Mechanical blocks
- Thruster housings
- Antenna silhouettes
- Warning lights

Use shared primitives and instancing.

The platform is decorative.

Do not add physics collision unless specified.

Keep underside detail low because it is rarely visible.

---

# 41. Procedural Ball

Create from:

```ts
new THREE.IcosahedronGeometry(
  authoritativeBallRadius,
  detail
);
```

Recommended:

```text
detail = 2 or 3
```

Material system:

- Dark body
- Emissive seams
- Contact flash uniform
- Team-colour temporary tint
- PSX jitter strength 0.25

Possible seam methods:

1. Vertex/face colour pattern
2. Barycentric wire-like shader
3. Generated panel mask
4. Duplicate slightly enlarged edge layer

Choose the simplest readable implementation.

Do not import a ball model.

The visual radius must match physics radius.

---

# 42. Boost Pad Visual Generation

Authoritative pad positions come from physics/stadium definitions.

Generate two visual variants.

## Small

Components:

- Low-poly inset plate
- Angular ring
- Small energy glyph
- 4–8 ambient pixels

## Full

Components:

- Larger ring
- Layered diamond/star geometry
- Low-poly vertical energy cluster
- 12–24 ambient pixels

Use shared geometries and materials.

Runtime state controls:

```text
active
inactive
respawning
collected pulse
```

Do not use pad visual bounds for pickup.

---

# 43. Starfield Generation

Use procedural `BufferGeometry` or instanced quads.

Inputs:

- Seed
- Layer
- Count
- Inner/outer radius
- Size range
- Colour probabilities

Generate:

```ts
positions: Float32Array
sizes: Float32Array
colours: Float32Array
phases: Float32Array
```

Use one object per starfield layer, not one object per star.

Shapes may be generated by shader:

- Square
- Cross
- Short strip

No star image asset required.

---

# 44. Particle Geometry

Shared particle primitives:

```text
square quad
triangle shard
short strip
small low-poly fragment
ring segment
```

Create each geometry once.

Use:

- `InstancedMesh`
- `Points`
- Dynamic `BufferGeometry`

Pool capacity follows VFX specification.

Do not allocate geometry on event.

Procedural UVs allow use of supplied effects textures if available.

Fallback particles work untextured.

---

# 45. Procedural Textures

Create:

```ts
export interface ProceduralTextureFactory {
  createDitherMatrix(): THREE.DataTexture;
  createFlatNormal(): THREE.DataTexture;
  createCheckerFallback(): THREE.CanvasTexture;
  createGoalGrid(): THREE.CanvasTexture;
  createFieldMarkingAtlas(): THREE.CanvasTexture;
  createParticleSquare(): THREE.CanvasTexture;
  createParticleTriangle(): THREE.CanvasTexture;
  createGradientRamp(): THREE.DataTexture;
  createNoiseTexture(seed: number): THREE.DataTexture;
}
```

All output:

- Has explicit dimensions
- Has explicit colour space
- Has explicit filtering
- Is cached
- Is named
- Is disposed through registry

## 45.1 Context Loss Recovery

The `AssetPipeline` must expose a `rebuildProceduralResources()` method. When WebGL context is restored (`webglcontextrestored`), procedural textures and geometries generated purely in memory (like Canvas/Data textures for goal grids, field markings, and particle sprites) must be regenerated, as they are not backed by an image URL and will render black otherwise.

---

# 46. UI Asset Generation

The UI remains native-resolution DOM/CSS.

No external icon or bitmap UI pack is required.

Use:

- CSS borders
- CSS pseudo-elements
- Inline SVG
- Programmatically generated SVG path strings
- Text labels
- CSS masks only if generated in source

Examples:

- Angular button chevrons
- Boost meter segments
- Controller glyph containers
- Scoreboard dividers
- Focus arrows
- Loading indicators

Controller prompt face-button labels may be:

```text
A / B / X / Y
Cross / Circle / Square / Triangle
```

Use CSS shapes or inline SVG.

Do not use proprietary platform artwork copied from system assets.

---

# 47. Fonts

Default to an original system-based stack:

```css
font-family:
  "Arial Narrow",
  "Roboto Condensed",
  "DIN Condensed",
  "Trebuchet MS",
  ui-sans-serif,
  sans-serif;
```

Utility numbers:

```css
font-family:
  ui-monospace,
  "SFMono-Regular",
  Consolas,
  monospace;
```

The exact look varies by platform.

For stable visual screenshots:

- Use a bundled open font only if the user later supplies or approves it.
- Until then, CI snapshots should use a fixed environment.

Do not download Google Fonts at runtime.

---

# 48. Shader Library

Centralise shader code.

```ts
export interface ShaderLibrary {
  vertexJitterChunk: string;
  glassVertex: string;
  glassFragment: string;
  goalGridVertex: string;
  goalGridFragment: string;
  starfieldVertex: string;
  starfieldFragment: string;
  particleVertex: string;
  particleFragment: string;
}
```

Do not copy slightly different shader strings into many files.

Use:

- Shared uniforms
- Shared precision declarations
- Stable define names
- Material keys
- Compile tests

Read `threejs-shaders` before editing.

---

# 49. Vertex Jitter Integration

Apply through:

- Shared custom shader material
- Or controlled `onBeforeCompile` injection

Requirements:

- Deterministic
- Per-material strength
- No random per-frame vertex changes
- Does not mutate geometry
- Does not affect UI
- Does not affect physics
- Stable shader cache keys

If using `onBeforeCompile`:

- Set `customProgramCacheKey`.
- Clone uniforms correctly.
- Do not create a new program key each frame.

---

# 50. Post-Processing Resources

Programmatic only.

Required resources:

- Low-resolution render target
- Quantisation shader pass
- Bayer dither pass
- Optional glow/bloom
- Nearest upscale material/pass

No LUT image is required.

If colour grading is needed:

- Implement simple shader curves
- Or generate a small data texture in code

Read `threejs-postprocessing` and `threejs-shaders`.

---

# 51. Lighting Assets

No HDRI required.

Use programmatic lights:

- Directional key
- Ambient/hemisphere fill if desired
- Limited point lights at goals
- Emissive materials

No cube texture required.

If supplied textures include an approved environment texture, it is optional and manifest-controlled.

The game remains visually complete without it.

---

# 52. Menu Presentation Assets

Generate menu background from live procedural game objects:

- Stadium
- Car instance
- Ball
- Boost pads
- Starfield
- Ambient particles

Do not create a separate imported menu diorama.

Use a deterministic scripted presentation state.

The menu can reuse shared geometry/materials.

---

# 53. Asset Cache

```ts
export class AssetCache {
  getGltf(url: string): LoadedGltfSource | undefined;
  setGltf(url: string, value: LoadedGltfSource): void;

  getTexture(id: TextureAssetId): THREE.Texture | undefined;
  setTexture(id: TextureAssetId, texture: THREE.Texture): void;

  clear(): void;
}
```

One network request per authored URL.

Do not cache failed promises forever without retry policy.

Retry policy:

- Development manual retry allowed
- Production fail clearly
- No infinite retry loop

---

# 54. Resource Ownership

Resources need explicit ownership.

```ts
export type ResourceOwner =
  | "asset-pipeline"
  | "stadium"
  | "car-instance"
  | "match-vfx"
  | "menu-presentation"
  | "debug-lab";
```

Shared source geometry/material/texture:

- Owned by asset pipeline
- Released at application shutdown

Instance-only material:

- Owned by instance or visual module
- Released on instance disposal

Transient VFX buffers:

- Owned by VFX pool
- Released when module disposes

---

# 55. Disposal

Implement:

```ts
export interface DisposableResource {
  dispose(): void;
}
```

Dispose:

- Geometries
- Materials
- Textures
- Render targets
- Post-processing passes where needed
- Animation mixers/actions
- Loader decoder resources
- Debug resources

Do not dispose:

- A shared texture when removing one car
- A shared stadium geometry during kickoff reset
- Global shader material while menu uses it

Use reference counting or clear ownership.

---

# 56. Match Lifecycle

At application boot:

- Build asset pipeline once.

At match start:

- Create visual instances from cached resources.
- Create match VFX pools.
- Bind physics snapshots.

At goal reset:

- Do not reload authored assets.
- Do not rebuild stadium.
- Reset pad state and transient effects only.

At replay:

- Reuse loaded resources.
- Dispose old match-only instance state.
- Create/reset match state.

At return to menu:

- Remove match-specific instances.
- Keep shared resources.
- Reuse stadium/menu assets if architecture allows.

At application shutdown/hot reload:

- Dispose all.

---

# 57. Asset Report

Generate machine-readable:

```text
artifacts/asset-report.json
```

```ts
export interface AssetReport {
  generatedAt: string;

  threeVersion: string;
  skillValidation: SkillValidationReport;

  authoredAssets: AuthoredAssetReport[];
  proceduralAssets: ProceduralAssetReport[];

  totals: {
    triangles: number;
    geometries: number;
    materials: number;
    textures: number;
    approximateTextureBytes: number;
  };

  warnings: string[];
  errors: string[];
}
```

Do not include nondeterministic timestamps in visual snapshot data.

The report file itself may include generation time.

---

# 58. Development Asset Lab

Create:

```text
?assetLab=1
```

Features:

- Select car source
- Inspect hierarchy
- Show node names
- Show material names
- Show source bounds
- Show physics hitbox
- Adjust visual alignment
- Switch team colours
- Toggle source/project materials
- Inspect supplied textures
- View texture filtering
- View procedural ball
- View stadium modules separately
- View pad variants
- View glass layers
- View particle shapes
- View starfield layers
- Display draw calls and triangles
- Trigger disposal/recreation

The lab must not alter production descriptors unless values are manually committed.

---

# 59. Browser Asset Test API

Expose in test/development builds:

```ts
declare global {
  interface Window {
    __ASSET_TEST__?: BrowserAssetTestApi;
  }
}
```

```ts
export interface BrowserAssetTestApi {
  ready(): boolean;
  getPipelineState(): AssetPipelineState;

  getAssetReport(): AssetReport;
  getLoadingProgress(): AssetLoadProgress;
  getErrors(): AssetLoadError[];

  listCarReports(): CarAssetInspectionReport[];
  listTextureReports(): TextureInspectionReport[];

  createCarPreview(
    carId: string,
    team: "player" | "opponent"
  ): void;

  setCarPreviewCamera(
    preset: CarPreviewCameraPreset
  ): void;

  showProceduralAsset(
    id: ProceduralAssetPreviewId
  ): void;

  setProceduralSeed(seed: number): void;
  rebuildProceduralPreview(): void;

  getSceneResourceCounts(): SceneResourceCounts;

  disposePreview(): void;
  recreatePreview(): void;

  simulateMissingTexture(id: TextureAssetId): void;
  simulateMissingCar(id: string): void;
}
```

---

# 60. Static Validation Scripts

## Validate skills

```bash
npm run validate:threejs-skills
```

## Validate assets

```bash
npm run validate:assets
```

Checks:

- Files exist
- Manifest valid
- Paths local
- IDs unique
- File extensions allowed
- Required attributions recorded
- No remote URLs
- Size limits
- Naming safety

## Runtime validation

Playwright validates decoded contents and rendering.

---

# 61. Recommended Package Scripts

```json
{
  "scripts": {
    "validate:threejs-skills": "node scripts/validate-threejs-skills.mjs",
    "validate:assets": "node scripts/validate-assets.mjs",
    "report:assets": "node scripts/create-asset-report.mjs",
    "test:assets": "playwright test tests/assets tests/procedural tests/visual",
    "validate": "npm run validate:threejs-skills && npm run validate:assets"
  }
}
```

Run validation before production build.

---

# 62. Playwright Authored-Asset Tests

## Car files load

For each required descriptor:

- Request succeeds
- `GLTFLoader` resolves
- Scene contains mesh
- Bounds finite
- Triangle count available
- Required material targets found
- Required sockets found
- No uncaught loader errors

## Car cache

Create two instances from one shared URL.

Assert:

- Source fetched once
- Geometry shared where intended
- Team materials independently tinted
- Changing player material does not recolour opponent

## Car alignment

Capture:

- Side
- Front
- Top
- Chase

Assert against reviewed screenshots.

## Texture loading

For each required texture:

- Request local
- Decode succeeds
- Colour space correct
- Filtering correct
- Wrapping correct
- Repeat correct

---

# 63. Playwright Procedural Determinism Tests

For a fixed seed:

- Stadium instance transforms equal
- Star positions equal
- Decorative variation equal
- Generated data texture bytes equal
- Procedural geometry attributes equal within tolerance

For a different seed:

- Decorative stars differ
- Core gameplay geometry dimensions do not change
- Boost-pad positions do not change
- Goal dimensions do not change

Never randomise gameplay-critical dimensions from seed.

---

# 64. Playwright Procedural Geometry Tests

## Ball

- Bounding radius matches physics ball radius
- Finite normals
- Finite UV/attributes
- Triangle count within budget

## Stadium

- Bounds match expected dimensions
- Goals centred
- Field markings symmetric
- Ribs generated
- Glass panels generated
- No empty geometry
- No NaN attributes

## Boost pads

- 12 small visuals
- 4 full visuals
- IDs match definitions
- Positions match definitions
- Small/full geometry distinct

## Starfield

- Expected layer count
- Expected point/instance count
- No stars inside prohibited central volume if configured
- Bounds finite

---

# 65. Visual Regression Matrix

Required asset screenshots:

- Player car neutral
- Player car cyan
- Opponent car magenta
- Both cars together
- Car physics alignment
- Procedural ball
- Floor panels
- Centre markings
- Player goal
- Opponent goal
- Glass panel close-up
- Structural rib
- Floating platform
- Small boost active
- Small boost inactive
- Full boost active
- Full boost inactive
- Starfield far/mid/near
- Boost particle
- Impact particles
- Goal particles
- Main menu background
- Entire stadium

Render for:

- Authentic preset
- Balanced preset
- Clean preset

Do not update snapshots blindly.

---

# 66. Missing-Asset Tests

Development:

- Missing required texture displays checker and error
- Missing optional texture uses semantic fallback
- Missing car displays procedural fallback and error
- Asset report records issue

Production configuration:

- Missing required texture fails readiness
- Missing required car fails readiness
- Match cannot start
- User sees actionable loading error
- No infinite spinner

---

# 67. Network Tests

Intercept browser requests.

Fail if:

- Asset request uses a remote origin
- Font request uses remote origin
- GLB references external remote image
- Decoder uses CDN
- Missing local asset silently falls back to remote

Allow only:

- App origin
- Development Vite internal requests
- Explicit test infrastructure

---

# 68. Resource-Leak Tests

Scenario:

1. Load menu.
2. Start match.
3. Score/replay repeatedly.
4. Return to menu.
5. Start match again.
6. Dispose preview lab.
7. Recreate preview.

Track:

- Renderer memory geometries
- Renderer memory textures
- Program count where available
- Asset registry counts
- VFX pool capacity

After warm-up:

- Counts should stabilise.
- Replays must not continuously increase resources.
- Car GLB must not refetch.
- Texture files must not refetch.

---

# 69. Performance Budgets

Authored cars:

```text
Preferred under 10k triangles each
Warning over 50k
```

Total gameplay:

```text
Visible triangles under 80k target
Draw calls under 150
Transparent draw calls under 30
Materials under 64 loaded gameplay set
Texture GPU memory under project-configured desktop budget
```

Procedural rules:

- Instanced repeated geometry
- Shared material registry
- Shared texture registry
- No per-frame geometry creation
- Bounded dynamic buffers

---

# 70. Procedural Asset Quality Workflow

For every major generated object:

1. Build blockout.
2. Verify dimensions.
3. Verify physics alignment.
4. Capture fixed screenshot.
5. Evaluate at 320×180.
6. Add supplied texture only if it improves hierarchy.
7. Add shader detail.
8. Profile draw calls.
9. Test disposal.
10. Record accepted parameters.

Do not add decorative complexity that disappears at final render resolution.

---

# 71. Texture Selection Workflow

When user textures arrive:

1. Inventory files.
2. Generate contact sheet/report.
3. Classify semantics.
4. Add manifest entries.
5. Preview each with correct colour space.
6. Test pixel and mipmapped filtering.
7. Select usage.
8. Record attribution.
9. Capture before/after visual comparison.
10. Keep unused textures out of required preload set.

Do not automatically apply every provided texture.

---

# 72. Car Intake Workflow

When car GLB arrives:

1. Place under `public/assets/cars/`.
2. Add descriptor.
3. Run loader inspection.
4. Review node/material names.
5. Configure forward/up correction.
6. Align to physics hitbox.
7. Configure team material targets.
8. Configure wheels if present.
9. Configure boost sockets.
10. Capture alignment screenshots.
11. Run full gameplay visual test.
12. Record report.

Do not modify physics hitbox to fit arbitrary visual size unless the physics specification is deliberately revised.

---

# 73. Procedural Calibration Log

```md
## YYYY-MM-DD — Stadium rib pass

Skills used:
- threejs-geometry
- threejs-materials

Problem:
Ribs disappear at 320×180.

Before:
- width:
- spacing:
- emissive:

After:
- width:
- spacing:
- emissive:

Performance:
- draw calls:
- triangles:

Screenshots:
- before
- after

Decision:
Accepted / Reverted / Revise
```

---

# 74. Error Presentation

Asset errors should be actionable.

Bad:

```text
Failed to load.
```

Good:

```text
Required car asset failed to load:
assets/cars/player-car.glb

GLTFLoader error:
Unsupported extension KHR_draco_mesh_compression.

Add the local Draco decoder configuration
or provide an uncompressed GLB.
```

Loading UI shows:

- Current phase
- Progress
- Failed path
- Retry in development
- Return to menu where appropriate

Do not expose enormous raw stack traces as the primary user message.

Log full details in development console/report.

---

# 75. Security and Robustness

Treat supplied files as untrusted data.

Requirements:

- No evaluation of file-provided scripts
- No arbitrary URL follow from manifest
- Path must resolve under `/assets/`
- Reject `javascript:` or `data:` URLs in manifest unless explicitly generated in code
- Bound file size
- Bound geometry count
- Bound texture dimensions
- Bound animation clip count
- Handle loader errors
- Handle WebGL allocation failures
- Avoid blocking main thread with unbounded traversal

GLB user data may be read for diagnostics.

Do not execute it.

---

# 76. Build and Deployment

Static deployment must include:

```text
assets/cars/*.glb
assets/textures/**/*
```

Vite/public files retain stable paths.

Validate production output:

- Car files copied
- Textures copied
- Correct MIME types
- No absolute local filesystem paths
- No remote dependencies
- Cache-busting strategy understood
- GLB range requests not required
- WASM decoder paths correct if used

The game should work from static hosting.

---

# 77. Versioning

```ts
export const ASSET_PIPELINE_CONTRACT_VERSION = "1.0";
```

Manifest:

```ts
schemaVersion: 1
```

Procedural asset keys include version suffixes when geometry changes:

```text
ball-faceted-v1
stadium-rib-v2
goal-grid-v1
```

When changing a generated asset in a way that affects snapshots:

1. Update key/version.
2. Update calibration log.
3. Review visual snapshots.
4. Check performance.
5. Update integration notes.

---

# 78. Integration With Physics

Physics supplies:

- Car render transforms
- Ball transform
- Ball radius
- Car hitbox debug dimensions
- Wheel-probe debug locations
- Boost pad definitions and state
- Impact events
- Jump/dodge/boost events

Assets/rendering never:

- Write physics transforms
- Change collider dimensions
- Decide pad pickup
- Decide goal
- Change boost
- Create gameplay collision from visual bounds

---

# 79. Integration With Visual Language

Visual module supplies:

- Palette
- PSX presets
- Jitter strengths
- Dither parameters
- Material roles
- Lighting targets
- Triangle/draw-call targets
- Particle design

Asset pipeline supplies:

- Concrete generated geometries
- Configured textures
- Material instances
- Car visuals
- Procedural resource ownership

---

# 80. Integration With AI

AI sees gameplay observations.

It does not see:

- Visual mesh bounds
- Decorative geometry
- Texture data
- Starfield
- Particle state

Procedural asset generation must not alter AI navigation geometry.

Boost pad visuals use the same IDs as AI/physics observations.

---

# 81. Integration With UI

UI requests:

- Car preview scene
- Loading progress
- Asset error message
- Prompt/icon generation
- Menu presentation scene

UI does not own:

- GLTFLoader
- Texture cache
- Stadium geometry
- Material disposal

---

# 82. Common Failure Modes

## Car loads but is sideways

Check:

- Descriptor forward axis
- Descriptor up axis
- Visual rotation
- GLB source transform
- Physics forward convention

## Car floats above ground

Check:

- Visual offset
- Source bounds centre
- Wheel-node origin
- Physics rest height
- Model scale

## Both cars change colour together

Check:

- Shared mutable material
- Source material mutation
- Team material not cloned
- Cache returns live instance instead of immutable source

## Car is enormous or tiny

Check:

- Source units
- Descriptor scale
- Parent scale
- Duplicate scaling
- GLB root transform

## Texture colours look washed out

Check:

- sRGB not set for colour map
- Renderer output colour space
- Texture interpreted as data
- Post-process ordering

## Normal map looks wrong

Check:

- sRGB incorrectly applied
- `flipY`
- Normal scale
- Tangents/UVs
- Map assigned to wrong material slot

## Pixel texture becomes blurry

Check:

- Magnification filter
- Minification filter
- Mipmaps
- Anisotropy
- Final low-resolution pass

## Texture shimmers badly

Check:

- No mipmaps for repeating distant surface
- Geometry too dense/thin
- Texture frequency too high
- Nearest-only minification inappropriate
- Jitter too strong

## Stadium creates too many draw calls

Check:

- No instancing
- One material per panel
- Repeated geometry not shared
- Transparent layers split unnecessarily
- Decorative pieces as separate meshes

## Glass sorts badly

Check:

- Too many overlapping layers
- One giant shell
- Depth write
- Render order
- Frames incorrectly transparent
- Camera exiting enclosure

## Procedural layout changes every reload

Check:

- `Math.random()`
- Seed not fixed
- Iteration order unstable
- Object ID included nondeterministically
- Timestamp used in seed

## Memory grows on replay

Check:

- Rebuilding shared stadium
- Cloning textures
- Material registry bypassed
- VFX pools recreated without disposal
- Old car mixers retained
- Debug preview not disposed

## Production silently shows fallback

Check:

- Required asset marked optional
- Production failure policy ignored
- Asset pipeline enters READY with errors
- Fallback mode not environment-gated

---

# 83. Phased Implementation Plan

## Phase 0 — Skill and manifest foundation

Implement:

- Skill validation
- Asset types
- Manifest
- Paths
- Loading manager
- Error model
- Test API shell

Exit:

- Missing skills produce clear failure.
- Manifest validates.
- Pipeline reports state.

## Phase 1 — Car intake

Implement:

- GLTFLoader
- Cache
- Inspection report
- Validation
- Normalisation hierarchy
- Procedural fallback

Exit:

- User cars load or produce actionable errors.
- Two instances can share one source safely.

## Phase 2 — Car visual alignment and materials

Implement:

- Hitbox alignment lab
- Team tint rules
- Material clone policy
- Optional wheels
- Boost sockets

Exit:

- Player/opponent visually distinct.
- Materials do not leak between instances.

## Phase 3 — Texture intake

Implement:

- Texture manifest
- Texture loader
- Colour-space rules
- Filtering profiles
- Fallbacks
- Texture report

Exit:

- All supplied textures are classified and inspectable.

## Phase 4 — Procedural registries

Implement:

- Seeded PRNG
- Geometry registry
- Material registry
- Procedural texture factory
- Ownership/disposal

Exit:

- Shared resources are stable and deterministic.

## Phase 5 — Stadium blockout generation

Implement:

- Floor
- Walls visual shell
- Transitions
- Goals
- Ribs
- Floating base

Exit:

- Full stadium generated without imported model.

## Phase 6 — Ball and boost pads

Implement:

- Faceted ball
- Small/full pad geometry
- Active/inactive states
- Generated goal grid

Exit:

- Gameplay-required world objects need no external models.

## Phase 7 — Glass and surface detailing

Implement:

- Glass layers
- Generated grid
- Supplied texture modulation
- Field marking generation
- Surface materials

Exit:

- Stadium matches dark-space visual language.

## Phase 8 — Starfield and particles

Implement:

- Three-layer stars
- Particle geometries
- Pools
- Procedural sprites/data
- Goal effects resources

Exit:

- No imported star or particle image required.

## Phase 9 — Shader/post-process resources

Implement:

- Jitter integration
- Glass shaders
- Particle shaders
- Dither resources
- Quantisation pass
- Glow setup

Exit:

- PSX pipeline complete from code.

## Phase 10 — UI and menu generated assets

Implement:

- Inline SVG/CSS decorations
- System font stacks
- Live menu scene
- Loading presentation
- Error presentation

Exit:

- No imported UI pack required.

## Phase 11 — Validation and performance

Implement:

- Static validators
- Asset reports
- Network tests
- Determinism tests
- Leak tests
- Visual matrix
- Performance profiling

Exit:

- Clean checkout plus supplied files produces complete game.
- Resource counts stabilise.
- No remote asset requests.

---

# 84. Definition of Done

Three.js skills:

- [ ] All ten required skills present
- [ ] Validation script
- [ ] Usage log
- [ ] Installed Three.js types checked
- [ ] Geometry work uses geometry skill
- [ ] Loading work uses loader skill
- [ ] Texture work uses texture skill
- [ ] Shader/post-process work uses matching skills

Authored assets:

- [ ] User car GLBs only
- [ ] User textures only
- [ ] Typed manifests
- [ ] Car intake report
- [ ] Texture intake report
- [ ] Attribution document
- [ ] Local-only asset paths
- [ ] No remote runtime assets

Cars:

- [ ] GLB cache
- [ ] Validation
- [ ] Safe cloning
- [ ] Team material separation
- [ ] Physics alignment
- [ ] Optional wheel support
- [ ] Optional animation support
- [ ] Development fallback
- [ ] Production failure on missing required car

Textures:

- [ ] Correct colour spaces
- [ ] Correct filters
- [ ] Correct wrapping
- [ ] Generated fallbacks
- [ ] No silent white materials
- [ ] Texture report
- [ ] Memory estimate

Procedural content:

- [ ] Stadium
- [ ] Floor panels
- [ ] Markings
- [ ] Goals
- [ ] Goal grid
- [ ] Ribs
- [ ] Glass panels
- [ ] Floating platform
- [ ] Ball
- [ ] Small boost pads
- [ ] Full boost pads
- [ ] Starfield
- [ ] Particles
- [ ] Trails
- [ ] Shockwaves
- [ ] Menu presentation

Architecture:

- [ ] Deterministic seeds
- [ ] Geometry registry
- [ ] Material registry
- [ ] Texture registry
- [ ] Resource ownership
- [ ] Disposal
- [ ] No per-frame asset construction
- [ ] No visual mesh used as physics authority

Testing:

- [ ] Skill validation
- [ ] Manifest validation
- [ ] Car loading tests
- [ ] Texture tests
- [ ] Procedural determinism
- [ ] Geometry invariants
- [ ] Visual snapshots
- [ ] Missing-asset tests
- [ ] Local-origin network tests
- [ ] Resource-leak tests
- [ ] Replay stability
- [ ] Performance budgets

---

# 85. Required Inputs From the User

The implementation can proceed with placeholders before these arrive, but production readiness requires:

## Cars

Either:

```text
public/assets/cars/player-car.glb
public/assets/cars/opponent-car.glb
```

or one shared:

```text
public/assets/cars/car.glb
```

with both manifest entries referencing it.

## Textures

Place under:

```text
public/assets/textures/
```

The implementation model must inventory and classify them rather than assuming filenames.

## Attribution

For each supplied file:

- Source/creator
- Permission or licence status
- Required attribution text
- Whether modification is allowed

---

# 86. Deferred Features

Do not block initial implementation on:

- Automatic mesh decimation
- Automatic UV unwrapping
- Automatic texture baking
- Automatic Blender conversion
- Runtime asset marketplace
- Downloadable cosmetics
- User-created cars
- Skin editor
- Mod support
- Remote CDN
- Streaming asset bundles
- Progressive mesh LOD generation
- Mobile texture compression pipeline
- WebGPU-specific assets
- Runtime GLB export
- Screenshot-to-texture generation
- External image generation
- Font download
- Multiple stadium themes

---

# 87. Reference Repository

Required implementation guidance repository:

```text
CloudAI-X/threejs-skills
```

The project must use the local copies of its skills.

Relevant skill intentions:

```text
threejs-loaders:
GLB, texture loading, async patterns, LoadingManager, caching

threejs-textures:
Colour spaces, wrapping, filtering, UVs, generated textures

threejs-geometry:
Built-in geometry, BufferGeometry, custom meshes, instancing

threejs-materials:
Material selection, PBR/unlit/custom materials, performance

threejs-shaders:
ShaderMaterial, uniforms, vertex changes, custom effects

threejs-postprocessing:
EffectComposer, screen effects, pixelation, custom passes
```

The repository skills are implementation instructions.

They are not runtime dependencies and should not be bundled into the production client JavaScript.

---

# 88. Final Architecture

```text
User-supplied inputs
├─ Car GLB file(s)
└─ Texture library
          |
          v
Typed asset manifest
          |
          v
Shared Three.js LoadingManager
          |
   +------+------+
   |             |
   v             v
GLTF cache    Texture registry
   |             |
   v             v
Car adapters  Configured texture resources
   \             /
    \           /
     v         v
Procedural resource system
├─ Geometry registry
├─ Material registry
├─ Shader library
├─ Data/Canvas textures
├─ Seeded generation
└─ Resource ownership
          |
          v
Complete generated visual world
├─ Stadium
├─ Ball
├─ Goals
├─ Glass
├─ Boost pads
├─ Stars
├─ Particles
├─ Menu scene
└─ UI decorations
          |
          v
PSX render pipeline
          |
          v
Playwright validation and visual regression
```

The intended result is a game whose authored content burden is deliberately tiny:

```text
Cars + textures supplied by the user
Everything else generated by code
```

The pipeline must be understandable by Claude Code, enforce the use of the project's Three.js skills, and reliably rebuild the same complete visual game from a clean repository checkout.
