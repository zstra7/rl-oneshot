# Core Application Architecture, Module Integration, Build, and Implementation Sequencing Specification

**Document version:** 1.1  
**Module ID:** `CORE_APPLICATION`  
**Primary audience:** A Sonnet-level coding LLM implementing the complete game from the modular specifications  
**Runtime:** Browser, local 1v1 against AI  
**Language:** TypeScript  
**Build system:** Vite  
**UI framework:** Vue 3  
**3D rendering:** Three.js `0.160.0`  
**Physics:** Rapier 3D Compat  
**Automated browser testing:** Playwright Test  
**Unit and integration testing:** Vitest  
**Package manager:** npm  
**Deployment:** Explicitly out of scope  
**Primary objective:** Coordinate all modules into one stable application and prescribe the order in which a Sonnet-level LLM should build, test, integrate, and refine the game

---

# 0. Instructions to the Implementing LLM

Read every module specification and this document before implementing the complete application.

This document is the coordination authority.

Follow these rules:

1. Treat each module specification as a contract.
2. Do not merge all modules into one large class.
3. Do not implement modules in arbitrary order.
4. Follow the implementation sequence in this document.
5. Complete each phase's exit criteria before starting the next phase.
6. Do not attempt final visual polish before the physics and match loop work.
7. Do not attempt advanced AI before the car can reliably drive toward a target.
8. Do not attempt supplied-car integration before the procedural fallback pipeline works.
9. Do not let Vue own the Three.js scene graph.
10. Do not put Three.js objects in deeply reactive Vue state.
11. Do not put Rapier objects in Vue state.
12. Do not put per-tick physics snapshots in Pinia.
13. Keep hot simulation data in plain TypeScript classes and typed arrays.
14. Use Vue for menus, HUD, settings, overlays, loading, and development panels.
15. Use one `GameRuntime` as the application coordinator.
16. Use explicit module APIs.
17. Use explicit lifecycle methods.
18. Use explicit event types.
19. Avoid a generic untyped event bus.
20. Avoid circular module imports.
21. Do not let lower-level modules import higher-level modules.
22. Never let rendering mutate physics.
23. Never let AI mutate physics directly.
24. Never let UI mutate module internals directly.
25. Never let asset visuals define physics dimensions.
26. Never create a second game loop inside a Vue component.
27. Never start multiple `requestAnimationFrame` loops.
28. Never step Rapier from more than one location.
29. Never use wall-clock time for deterministic match rules.
30. Never use the `new` keyword (e.g., `new THREE.Vector3()`, `new RAPIER.Vector3()`, `new THREE.Quaternion()`) inside `update()`, `tick()`, or `frame()` functions. Always pre-allocate and mutate global or class-level scratchpad variables to prevent catastrophic garbage collection pauses.
31. Pin dependency versions exactly.
32. Commit `package-lock.json`.
33. Do not use floating version ranges.
34. Do not upgrade Three.js without reviewing every Three.js skill and visual regression.
35. Do not upgrade Rapier without rerunning every physics regression.
36. Do not add a dependency when a small local implementation is sufficient.
37. Keep production dependencies minimal.
38. Use `npm ci` for reproducible clean builds.
39. Build must fail on TypeScript errors.
40. Build must fail on required asset errors.
41. Build must fail on missing Three.js skills.
42. Build must fail on contract-version incompatibility.
43. Run Playwright against the production preview build as well as the dev server.
44. Keep deterministic browser test APIs behind development/test flags.
45. Remove or tree-shake debug overlays in production mode where possible.
46. Keep all module version constants in a central compatibility registry.
47. Record integration deviations in `docs/integration-deviations.md`.
48. Record phase progress in `docs/implementation-progress.md`.
49. Record build decisions in `docs/build-decisions.md`.
50. When blocked, implement the smallest explicit fallback permitted by the relevant module.
51. Do not invent large deferred systems.
52. Do not work on deployment.
53. The application is complete only when a clean checkout can install, validate, build, preview, and pass its release test suite.

---

# 1. Role of This Document

The project has separate detailed specifications for:

```text
Physics
Visual language, stadium, VFX, UI, and match flow
Opponent AI
Input and controls
Asset production and procedural content
```

This document defines:

- How those modules fit together
- Which module may import which
- Which system owns each piece of state
- Application startup
- Application shutdown
- Game-loop ordering
- Vue integration
- Vite configuration
- Package versions
- Build scripts
- Testing layers
- Error boundaries
- Development tools
- How the Sonnet-level LLM should sequence implementation
- How to prevent unfinished modules from blocking progress
- How to determine when each phase is complete
- How to create the final integrated build

This is not a replacement for the detailed module documents.

---

# 2. Required Module Specifications

Expected current contracts:

```ts
PHYSICS_MODULE_CONTRACT_VERSION = "2.1";
VISUAL_GAMEFLOW_CONTRACT_VERSION = "1.1";
OPPONENT_AI_CONTRACT_VERSION = "1.1";
INPUT_CONTROLS_CONTRACT_VERSION = "1.0";
ASSET_PIPELINE_CONTRACT_VERSION = "1.0";
CORE_APPLICATION_CONTRACT_VERSION = "1.0";
```

Create:

```ts
export const CORE_APPLICATION_CONTRACT_VERSION = "1.0";
```

Central compatibility:

```ts
export const REQUIRED_MODULE_CONTRACTS = {
  physics: "2.1",
  visualGameFlow: "1.1",
  opponentAi: "1.1",
  inputControls: "1.0",
  assetPipeline: "1.0"
} as const;
```

At application boot:

1. Import each module's exported version.
2. Compare exact supported major/minor.
3. Throw an actionable integration error on mismatch.

---

# 3. Technology Decisions

## 3.1 Vite

Use Vite for:

- Development server
- TypeScript transformation
- Vue SFC support
- Static asset handling
- WASM bundling
- HMR
- Production build
- Preview server
- Environment replacement
- Chunk generation

## 3.2 Vue

Use Vue 3 for:

- Main menu
- Match setup
- Settings
- HUD
- Countdown
- Goal banner
- Pause menu
- Results
- Loading/error screens
- Debug and calibration panels

Do not use Vue for:

- Physics stepping
- Three.js object hierarchy
- Per-frame particle simulation
- Ball prediction
- AI tactical update
- Raw gamepad polling
- Render interpolation
- Per-tick telemetry hot paths

## 3.3 Three.js

Pin:

```json
"three": "0.160.0"
```

Reason:

- The project-approved Three.js skills state that they were audited against Three.js r160+.
- Using exactly r160 provides the smallest compatibility gap.
- Skill examples use `three/addons/` import paths.

Do not install `@types/three`; Three.js includes its own types.

## 3.4 Rapier

Use:

```json
"@dimforge/rapier3d-compat": "0.19.3"
```

Reasons:

- Browser-friendly embedded WASM compatibility build
- Simplifies Vite integration
- Matches the established physics architecture
- Avoids a separate WASM asset-path failure during the first implementation

Do not switch to SIMD or deterministic variants during initial implementation.

## 3.5 State management

Use Pinia only for low-frequency UI/application state.

Use:

```json
"pinia": "4.0.2"
```

Do not use Pinia for hot simulation state.

## 3.6 Routing

Do not use Vue Router initially.

The game is a single-screen application with an internal app/match state machine.

Reasons:

- URL routing provides little value
- It can conflict with browser Back input
- Menus are not independent pages
- Application state already defines screens

Add a router later only if real URL-addressable pages are required.

## 3.7 Testing

Use:

```json
"@playwright/test": "1.61.1"
```

Use Vitest for pure TypeScript tests.

Pin the selected Vitest version after scaffolding and verifying compatibility with the chosen Vite version.

## 3.8 TypeScript

Use:

```json
"typescript": "7.0.2"
"vue-tsc": "3.3.7"
```

Build must run both:

```text
vue-tsc --noEmit
vite build
```

## 3.9 Current UI/build versions

Pin:

```json
"vue": "3.5.40"
"vite": "8.1.5"
"@vitejs/plugin-vue": "6.0.8"
```

Exact pins are intentional.

Commit the lockfile.

---

# 4. Required Package Manifest

Initial target:

```json
{
  "name": "space-carball",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "dev": "vite",
    "type-check": "vue-tsc --noEmit",
    "build:app": "vite build",
    "build": "npm run validate && npm run type-check && npm run test:unit && npm run build:app",
    "preview": "vite preview --host 127.0.0.1",
    "validate:contracts": "node scripts/validate-contracts.mjs",
    "validate:threejs-skills": "node scripts/validate-threejs-skills.mjs",
    "validate:assets": "node scripts/validate-assets.mjs",
    "validate:architecture": "node scripts/validate-architecture.mjs",
    "validate": "npm run validate:contracts && npm run validate:threejs-skills && npm run validate:assets && npm run validate:architecture",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:dev": "playwright test --project=chromium-dev",
    "test:e2e:preview": "playwright test --project=chromium-preview",
    "test:physics": "playwright test tests/physics",
    "test:input": "playwright test tests/input",
    "test:assets": "playwright test tests/assets tests/procedural",
    "test:game-flow": "playwright test tests/game-flow",
    "test:ai": "playwright test tests/ai",
    "test:visual": "playwright test tests/visual",
    "test:integration": "playwright test tests/integration",
    "test:release": "npm run build && playwright test --project=chromium-preview tests/smoke tests/integration tests/release",
    "report:assets": "node scripts/create-asset-report.mjs",
    "report:build": "node scripts/create-build-report.mjs"
  },
  "dependencies": {
    "@dimforge/rapier3d-compat": "0.19.3",
    "pinia": "4.0.2",
    "three": "0.160.0",
    "vue": "3.5.40"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@vitejs/plugin-vue": "6.0.8",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vue-tsc": "3.3.7"
  }
}
```

Add exact Vitest and linting versions only after verifying compatibility in the scaffold.

Do not use caret or tilde ranges.

---

# 5. Version-Lock Policy

## 5.1 Exact versions

Use:

```json
"three": "0.160.0"
```

Not:

```json
"three": "^0.160.0"
```

## 5.2 Lockfile

Commit:

```text
package-lock.json
```

Clean setup:

```bash
npm ci
```

Never use:

```bash
npm install
```

in CI or reproducibility verification unless intentionally updating dependencies.

## 5.3 Upgrade procedure

Any Three.js upgrade requires:

1. Create upgrade branch.
2. Review all ten Three.js skills.
3. Compare changed Three.js APIs.
4. Compile.
5. Run asset tests.
6. Run shader tests.
7. Run visual screenshots.
8. Run memory tests.
9. Update documented compatibility version.
10. Update lockfile intentionally.

Any Rapier upgrade requires the full physics suite.

---

# 6. Node and Environment

Use Node:

```text
22.12 or newer compatible version
```

Add:

```text
.nvmrc
```

Recommended:

```text
22
```

Add:

```text
.node-version
```

Recommended:

```text
22
```

The exact CI Node patch may be pinned in the future.

No deployment configuration is required.

---

# 7. Vite Configuration

Create:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const isTestBuild =
    mode === "test" ||
    process.env.PLAYWRIGHT_TEST === "1";

  return {
    plugins: [
      vue()
    ],

    resolve: {
      alias: {
        "@": fileURLToPath(
          new URL("./src", import.meta.url)
        )
      }
    },

    define: {
      __DEV__: JSON.stringify(mode !== "production"),
      __TEST_BUILD__: JSON.stringify(isTestBuild),
      __PHYSICS_CONTRACT__: JSON.stringify("2.1"),
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version
      )
    },

    assetsInclude: [
      "**/*.glb",
      "**/*.gltf",
      "**/*.wasm"
    ],

    build: {
      target: "es2022",
      sourcemap: true,

      rollupOptions: {
        output: {
          manualChunks: {
            vue: [
              "vue",
              "pinia"
            ],
            three: [
              "three"
            ],
            rapier: [
              "@dimforge/rapier3d-compat"
            ]
          }
        }
      }
    },

    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true
    },

    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true
    }
  };
});
```

Review chunking after measurement.

Do not micro-optimise chunks before the application works.

---

# 8. TypeScript Configuration

Use strict TypeScript.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": false,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": [
        "src/*"
      ]
    }
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.vue",
    "tests/**/*.ts",
    "vite.config.ts",
    "playwright.config.ts"
  ]
}
```

Module boundaries may require small exceptions.

Do not broadly weaken strictness.

---

# 9. Top-Level Application Structure

```text
src/
├─ main.ts
├─ App.vue
├─ env.d.ts
│
├─ core/
│  ├─ index.ts
│  ├─ GameRuntime.ts
│  ├─ GameRuntimeFactory.ts
│  ├─ ApplicationLifecycle.ts
│  ├─ ApplicationState.ts
│  ├─ ContractRegistry.ts
│  ├─ RuntimeClock.ts
│  ├─ FixedStepCoordinator.ts
│  ├─ FrameCoordinator.ts
│  ├─ EventDispatcher.ts
│  ├─ EventTypes.ts
│  ├─ ErrorReporter.ts
│  ├─ RuntimeDiagnostics.ts
│  └─ BuildInfo.ts
│
├─ integration/
│  ├─ ModuleContainer.ts
│  ├─ ModuleBindings.ts
│  ├─ PhysicsInputBinding.ts
│  ├─ PhysicsRenderBinding.ts
│  ├─ PhysicsGameFlowBinding.ts
│  ├─ PhysicsVfxBinding.ts
│  ├─ AiInputBinding.ts
│  ├─ UiGameFlowBinding.ts
│  ├─ AudioEventBinding.ts
│  └─ ContractValidation.ts
│
├─ physics/
├─ input/
├─ ai/
├─ assets/
├─ stadium/
├─ visual-language/
├─ vfx/
├─ camera/
├─ game-flow/
├─ audio/
├─ ui/
│
├─ stores/
│  ├─ applicationStore.ts
│  ├─ settingsStore.ts
│  ├─ hudStore.ts
│  ├─ loadingStore.ts
│  └─ debugStore.ts
│
├─ components/
│  ├─ GameCanvas.vue
│  ├─ MainMenu.vue
│  ├─ MatchSetup.vue
│  ├─ SettingsScreen.vue
│  ├─ GameplayHud.vue
│  ├─ CountdownOverlay.vue
│  ├─ GoalOverlay.vue
│  ├─ PauseMenu.vue
│  ├─ ResultsScreen.vue
│  ├─ LoadingScreen.vue
│  ├─ ErrorScreen.vue
│  └─ debug/
│
└─ testing/
   ├─ TestApiInstaller.ts
   └─ BrowserCombinedTestApi.ts
```

---

# 10. Dependency Direction

Allowed dependency layers:

```text
Layer 0: Shared types/utilities
Layer 1: Assets, input, physics primitives
Layer 2: Physics systems, procedural stadium definitions
Layer 3: AI, game flow, camera, rendering, VFX
Layer 4: Integration/core runtime
Layer 5: Vue stores and components
```

Allowed arrows:

```text
Higher layer -> lower layer
```

Forbidden:

```text
Lower layer -> higher layer
```

Examples:

- Physics may import shared math and physics types.
- AI may import public physics observations.
- Integration may import physics and AI.
- Vue may import integration facade and UI stores.
- Physics may not import Vue.
- AI may not import Vue.
- Assets may not import Vue components.
- Input may not import game-flow implementation.
- Stadium visual code may not import AI.

---

# 11. Architecture Validation

Create:

```text
scripts/validate-architecture.mjs
```

Initially validate with simple import-path rules.

Forbidden imports:

```text
src/physics/** -> vue, pinia, src/ui, src/ai, src/game-flow
src/ai/** -> vue, pinia, Rapier private internals
src/input/** -> vue components, physics controllers
src/assets/** -> Vue stores
src/stadium/** -> AI
src/ui/** -> Rapier
```

Later use an import-boundary lint plugin only if necessary.

Do not add a complex monorepo tool for this project.

---

# 12. Module Interface Pattern

Each major module should expose:

```ts
export interface GameModule {
  initialise(): Promise<void> | void;
  dispose(): void;
}
```

Tick modules may expose:

```ts
export interface FixedTickModule {
  beforePhysicsTick?(
    context: FixedTickContext
  ): void;

  afterPhysicsTick?(
    context: FixedTickContext
  ): void;
}
```

Render modules:

```ts
export interface RenderFrameModule {
  updateRenderFrame(
    context: RenderFrameContext
  ): void;
}
```

Do not force all modules into one base class.

Use explicit narrow interfaces.

---

# 13. Module Container

```ts
export interface ModuleContainer {
  assets: AssetPipeline;
  physics: PhysicsFacade;
  input: InputControlsModule;
  ai: OpponentAiModule;
  gameFlow: MatchFlowController;
  stadium: StadiumModule;
  renderer: SceneRenderer;
  camera: CameraModule;
  vfx: VfxModule;
  audio: AudioModule;
}
```

The container is created once by `GameRuntimeFactory`.

Vue components receive only a UI-facing facade, not the full container.

---

# 14. Game Runtime

```ts
export interface GameRuntimeFacade {
  initialise(
    canvas: HTMLCanvasElement
  ): Promise<void>;

  start(): void;
  stop(): void;
  dispose(): void;

  requestAction(
    action: UiRequestedAction
  ): void;

  getReadOnlyState():
    ReadonlyApplicationSnapshot;
}
```

Internal:

```ts
export class GameRuntime {
  private state: RuntimeState;
  private modules: ModuleContainer;

  private frameHandle: number | null;
  private lastFrameTimeMs: number;
  private accumulatorSeconds: number;

  initialise(
    canvas: HTMLCanvasElement
  ): Promise<void>;

  frame(timestampMs: number): void;
  dispose(): void;
}
```

There must be one `GameRuntime`.

---

# 15. Vue Boundary

## 15.1 App.vue

Responsibilities:

- Mount global layout
- Mount `GameCanvas`
- Mount UI overlays
- Reflect application screen state
- Show loading and fatal errors

It does not:

- Create Rapier world
- Create Three.js renderer directly
- Step simulation
- Poll gamepads
- Manage AI

## 15.2 GameCanvas.vue

Responsibilities:

- Own `<canvas>`
- Pass canvas element to runtime
- Observe element size
- Notify runtime of resize
- Dispose runtime on unmount if application root owns it

Example:

```vue
<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref
} from "vue";

import {
  useGameRuntime
} from "@/core/useGameRuntime";

const canvasRef =
  ref<HTMLCanvasElement | null>(null);

const runtime =
  useGameRuntime();

onMounted(async () => {
  const canvas = canvasRef.value;

  if (!canvas) {
    throw new Error(
      "Game canvas was not mounted."
    );
  }

  await runtime.initialise(canvas);
  runtime.start();
});

onBeforeUnmount(() => {
  runtime.dispose();
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="game-canvas"
  />
</template>
```

The actual application should ensure runtime is not accidentally created twice under HMR.

---

# 16. Vue Reactivity Rules

Do not make these reactive:

- `THREE.Scene`
- `THREE.WebGLRenderer`
- `THREE.Camera`
- `THREE.Object3D`
- `THREE.Material`
- `THREE.Texture`
- Rapier world
- Rapier bodies/colliders
- AI prediction samples
- Per-tick telemetry arrays
- Particle pool internals

If the `GameRuntime` instance or any Three.js object must be referenced in a Vue-owned wrapper or cross the Vue boundary, you must wrap it in Vue's `markRaw()`. Never allow Vue's `Proxy` to recursively walk the Three.js scene graph or Rapier world. Alternatively, ensure the UI only receives serializable POJO snapshots via the event dispatcher.

Use Vue state for low-frequency serialisable values:

- Current screen
- Score
- Timer text
- Boost integer
- Settings
- Loading progress
- Error messages
- Active input prompt
- Debug overlay visibility

---

# 17. Pinia Store Boundaries

## Application store

```ts
interface ApplicationStoreState {
  appState: AppState;
  matchState: MatchState;
  fatalError: UiError | null;
}
```

## Settings store

Serialisable settings only.

## HUD store

```ts
interface HudStoreState {
  playerScore: number;
  opponentScore: number;
  timerText: string;
  overtime: boolean;
  boostAmountRounded: number;
  ballCameraEnabled: boolean;
}
```

Update HUD at a bounded rate:

```text
30–60 Hz
```

Do not publish the complete physics snapshot into Pinia.

## Loading store

Asset and startup progress.

## Debug store

Visible debugging configuration, not the entire telemetry history.

---

# 18. Event Model

Use typed domain events.

```ts
export interface TypedEventMap {
  // Physics
  "physics:car-ball-contact":
    CarBallContactStartedEvent;

  "physics:car-car-contact":
    CarCarContactStartedEvent;

  "physics:boost-pad-collected":
    BoostPadCollectedEvent;

  "physics:boost-pad-respawned":
    BoostPadRespawnedEvent;

  // Match
  "match:state-changed":
    MatchStateChangedEvent;

  "match:goal-awarded":
    GoalAwardedEvent;

  "match:overtime-started":
    OvertimeStartedEvent;

  // Input
  "input:active-device-changed":
    ActiveDeviceChangedEvent;

  "input:pause-requested":
    PauseRequestedEvent;

  // Assets
  "assets:progress":
    AssetProgressEvent;

  "assets:error":
    AssetErrorEvent;
}
```

Dispatcher:

```ts
export interface TypedEventDispatcher<
  Events extends object
> {
  on<K extends keyof Events>(
    type: K,
    listener: (
      event: Events[K]
    ) => void
  ): Unsubscribe;

  emit<K extends keyof Events>(
    type: K,
    event: Events[K]
  ): void;
}
```

Avoid stringly typed payloads.

---

# 19. Commands Versus Events

Use commands for requested mutations:

```text
Start match
Pause
Resume
Return to menu
Reset match
Set input
Set visual preset
```

Use events for facts that occurred:

```text
Goal awarded
Pad collected
Car hit ball
Controller disconnected
Asset failed
```

Do not use an event bus as a command queue without explicit semantics.

---

# 20. Application Startup Sequence

```text
1. Browser loads JavaScript.
2. Vue app mounts.
3. Loading screen appears.
4. Core runtime singleton is created.
5. Module contract versions validate.
6. Three.js skills installation validation is represented in build validation.
7. Asset pipeline initialises.
8. Rapier initialises.
9. Three.js renderer initialises.
10. Procedural shared resources build.
11. Stadium visual and physics definitions build.
12. Physics world initialises from stadium definition.
13. Input module attaches listeners.
14. Camera and VFX initialise.
15. Game-flow initialises in MAIN_MENU.
16. AI initialises but remains disabled.
17. Menu presentation scene starts.
18. Test APIs install in dev/test mode.
19. Loading UI transitions to menu.
```

To handle strict memory constraints and WebKit quirks common on iPad and macOS hardware, the Vue application must implement a strict Loading Gate that completely blocks the mounting and rendering of `GameCanvas.vue` until the `GameRuntime` explicitly emits a `WASM_READY` event. Rapier's WASM initialization must be fully awaited before allowing Three.js to construct the scene graph.

Do not initialise match-only VFX before assets are ready.

---

# 21. Startup Failure Handling

Failure classes:

```ts
export type StartupFailureKind =
  | "CONTRACT_MISMATCH"
  | "ASSET_FAILURE"
  | "RAPIER_FAILURE"
  | "WEBGL_UNAVAILABLE"
  | "SHADER_COMPILE_FAILURE"
  | "UNKNOWN";
```

Fatal startup error UI provides:

- Human-readable summary
- Failed module
- Actionable detail
- Development technical detail
- Reload action
- Return to safe menu if possible

Do not leave a permanent spinner.

---

# 22. Application States

```ts
export type AppState =
  | "BOOT"
  | "LOADING"
  | "MENU"
  | "MATCH"
  | "FATAL_ERROR"
  | "DISPOSED";
```

Match states remain owned by game flow.

App state is coarse.

Do not duplicate the match state machine in Vue.

---

# 23. Frame Loop

One loop:

```ts
private frame = (
  timestampMs: number
): void => {
  if (!this.running) return;

  const frameDelta =
    this.clock.computeFrameDelta(
      timestampMs
    );

  this.input.updateBrowserFrame(
    timestampMs
  );

  this.fixedStepCoordinator.advance(
    frameDelta
  );

  const alpha =
    this.fixedStepCoordinator.alpha;

  this.updatePresentation(
    timestampMs,
    frameDelta,
    alpha
  );

  this.renderer.render();

  this.frameHandle =
    requestAnimationFrame(
      this.frame
    );
};
```

No Vue animation loop.

No VFX-owned RAF.

No camera-owned RAF.

---

# 24. Fixed-Step Coordinator

Physics:

```text
120 Hz
```

```ts
const FIXED_DT = 1 / 120;
```

Coordinator:

```ts
export class FixedStepCoordinator {
  private accumulator = 0;
  private tick = 0;

  advance(frameDelta: number): void {
    this.accumulator +=
      Math.min(
        frameDelta,
        MAX_FRAME_DELTA
      );

    let steps = 0;

    while (
      this.accumulator >= FIXED_DT &&
      steps < MAX_CATCH_UP_STEPS
    ) {
      this.stepFixedTick();

      this.accumulator -= FIXED_DT;
      this.tick += 1;
      steps += 1;
    }

    if (
      steps === MAX_CATCH_UP_STEPS &&
      this.accumulator >= FIXED_DT
    ) {
      this.handleSpiralPrevention();
    }
  }

  get alpha(): number {
    return this.accumulator /
      FIXED_DT;
  }
}
```

Suggested:

```text
MAX_FRAME_DELTA = 0.25 seconds
MAX_CATCH_UP_STEPS = 8–16 after testing
```

Manual Playwright stepping bypasses RAF.

---

# 25. Fixed-Tick Order

Use the combined module order:

```text
1. Read current game-flow control permissions.
2. Sample human input for this exact tick.
3. Build AI update context.
4. If allowed, request AI CarInput.
5. Submit both CarInputs to physics.
6. Run physics before-tick systems.
7. Step Rapier exactly once.
8. Resolve physics contacts and boost pads.
9. Emit canonical physics events.
10. Game flow consumes goal/dead-ball facts.
11. AI receives relevant delayed-observation source events.
12. VFX queues event-driven effects.
13. Audio queues event-driven effects.
14. Capture physics render snapshot.
15. Record bounded telemetry.
16. Advance deterministic match timers.
```

AI must not run after physics and then affect the same tick.

Its output affects the next physics step in the defined order.

---

# 26. Render-Frame Order

After fixed ticks:

```text
1. Interpolate car and ball render transforms.
2. Update car visual wheels and emissive state.
3. Update camera from interpolated state.
4. Update VFX visual simulation.
5. Update starfield/menu presentation.
6. Update material uniforms.
7. Update HUD-facing low-frequency snapshot.
8. Render low-resolution world.
9. Apply post-processing.
10. Upscale.
11. Vue renders native-resolution UI independently.
```

Do not interpolate authoritative gameplay state.

---

# 27. Match Creation

```ts
export interface MatchCreationRequest {
  durationMinutes: 1 | 3 | 10;
  aiDifficulty:
    "easy" |
    "medium" |
    "hard";
}
```

Process:

1. Validate asset readiness.
2. Exit menu presentation.
3. Create/reset match-owned VFX.
4. Create physics match state.
5. Set both cars to 33 boost.
6. Activate all pads.
7. Reset AI.
8. Reset input edge queues.
9. Set chase camera.
10. Enter kickoff setup.
11. Begin countdown.

Do not reload assets.

---

# 28. Match Disposal

On return to menu:

1. Stop match input.
2. Disable AI.
3. Stop match clock.
4. Dispose match-only VFX instances.
5. Remove match-only scene nodes.
6. Clear event subscriptions owned by match.
7. Reset camera.
8. Start menu presentation.
9. Preserve shared stadium/assets where intended.
10. Preserve settings.

Do not dispose global geometry/texture caches.

---

# 29. Pause Integration

Pause request comes from input.

Game flow decides validity.

When paused:

- Fixed physics stepping stops.
- Match timer stops.
- AI progression stops.
- Input context changes to PAUSED.
- Gameplay input edge queue clears.
- Camera may remain render-updatable.
- UI animation may continue.
- Ambient non-gameplay effects may continue.
- Haptics stop.
- Resume requires fresh confirmation.

The RAF may continue for menu/UI presentation.

---

# 30. Input Integration

Input module outputs:

```text
HumanGameplayInputFrame
```

Integration submits:

```ts
physics.setCarInput(
  "car-player",
  frame.car
);
```

And human control profile:

```ts
physics.setCarControlProfile(
  "car-player",
  frame.carControlProfile
);
```

AI submits:

```ts
physics.setCarInput(
  "car-opponent",
  aiInput
);
```

Input module never knows about Rapier body handles.

---

# 31. AI Integration

AI reads public observations.

Use an observation adapter:

```ts
export interface AiObservationAdapter {
  createContext(
    physics: WorldSerializableState,
    match: MatchContext
  ): AiUpdateContext;
}
```

The adapter:

- Assigns attacking/defending goals
- Supplies pad observations
- Supplies current public physics state
- Supplies recent public events
- Does not expose render objects

AI returns only `CarInput`.

---

# 32. Stadium Integration

Stadium module produces both:

```ts
interface StadiumBuildResult {
  visual: StadiumVisualInstance;
  physics: PhysicsArenaDefinition;
  ai: AiArenaDescription;
  camera: CameraArenaMetadata;
}
```

All outputs derive from one high-level stadium definition.

Do not independently type field dimensions into four modules.

---

# 33. Asset Integration

Asset pipeline initialises before rendering world content.

Renderer requests:

- Car visual factories
- Material registry
- Procedural resource factories
- Supplied textures
- Stadium visual resources
- Ball visual
- Boost pad visual

Physics does not import assets.

The asset pipeline does not import Rapier.

Integration binds IDs:

```text
physics car-player -> player car visual
physics car-opponent -> opponent car visual
physics ball-main -> procedural ball visual
physics boost pad ID -> pad visual instance
```

---

# 34. Rendering Integration

Scene renderer owns:

- Renderer
- Scene
- Cameras
- Render targets
- Post-processing
- Scene roots

Recommended roots:

```text
Scene
├─ SharedEnvironmentRoot
├─ StadiumRoot
├─ DynamicGameplayRoot
├─ VfxRoot
├─ MenuPresentationRoot
└─ DebugRoot
```

Renderer reads immutable render snapshot.

It never reads mutable Rapier objects directly.

---

# 35. Camera Integration

Camera module consumes:

- Interpolated player car transform
- Interpolated ball transform
- Stadium camera limits
- Camera input
- Presentation impulses

It emits:

- Active Three.js camera
- Camera mode state
- UI-facing ball-camera state

Camera does not step physics.

---

# 36. VFX Integration

VFX subscribes to:

- Boost activation
- Jump
- Dodge
- Car-ball contact
- Car-car contact
- Pad collection
- Pad respawn
- Goal
- Overtime
- Match end

VFX may read interpolated transforms.

VFX never decides whether an event occurred.

---

# 37. Audio Integration Placeholder

The dedicated audio specification may be written separately.

Architecture now reserves:

```ts
export interface AudioModule extends GameModule {
  setVolumes(
    settings: AudioSettings
  ): void;

  consumeEvent(
    event: AudioGameEvent
  ): void;

  resumeAudioContextFromUserGesture():
    Promise<void>;
}
```

Until audio implementation:

- Use a `NullAudioModule`.
- It accepts events.
- It does nothing.
- It does not block the game.

Do not scatter direct `new Audio()` calls through modules.

---

# 38. Null and Placeholder Modules

To unblock sequencing, define valid placeholders.

Allowed:

```text
NullAudioModule
NeutralOpponentAi
ProceduralCarFallback
BasicStadiumMaterialPreset
NoOpHapticController
```

Requirements:

- Implements the real interface
- Clearly reported in diagnostics
- Replaceable without changing consumers
- Not silently considered production-complete

Do not create fake physics.

---

# 39. Build Modes

```ts
export type BuildMode =
  | "development"
  | "test"
  | "production";
```

## Development

- HMR
- Debug APIs
- Debug overlays
- Detailed errors
- Asset fallbacks
- Source maps

## Test

- Deterministic APIs
- Fixed seeds
- Reduced nondeterminism
- Debug APIs
- No unrelated animations unless scenario requires
- Playwright hooks

## Production

- No test mutation APIs
- No development-only controls
- Required assets fail hard
- Source maps currently allowed for local debugging
- Console noise minimised
- Debug overlays disabled by default

---

# 40. Environment Variables

Use only compile-time safe values.

```text
VITE_APP_TITLE
VITE_DEFAULT_AI_DIFFICULTY
VITE_DEFAULT_MATCH_MINUTES
VITE_ENABLE_DEBUG_UI
```

Do not put secrets in Vite variables.

No backend secrets exist.

Typed:

```ts
interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_DEFAULT_AI_DIFFICULTY?:
    "easy" | "medium" | "hard";
  readonly VITE_DEFAULT_MATCH_MINUTES?:
    "1" | "3" | "10";
  readonly VITE_ENABLE_DEBUG_UI?:
    "0" | "1";
}
```

---

# 41. Build-Time Validation

Before Vite build:

```text
Contract versions
Three.js skills
Asset manifest
Required authored files
Architecture imports
TypeScript
Unit tests
```

Vite build is not the first validation step.

Build command:

```bash
npm run build
```

Expected order:

```text
validate
-> type-check
-> unit tests
-> Vite build
```

---

# 42. Build Output Validation

After Vite build, verify:

- `dist/index.html`
- JavaScript chunks
- CSS
- Required GLB files
- Required textures
- No unexpected remote URLs
- No source absolute paths
- No missing asset warnings
- Expected chunks
- Build metadata

Create:

```text
scripts/create-build-report.mjs
```

Output:

```text
artifacts/build-report.json
```

---

# 43. Build Report

```ts
export interface BuildReport {
  generatedAt: string;

  versions: {
    app: string;
    node: string;
    vue: string;
    vite: string;
    three: string;
    rapier: string;
    playwright: string;
  };

  contracts:
    Record<string, string>;

  files: {
    path: string;
    bytes: number;
  }[];

  totals: {
    javascriptBytes: number;
    cssBytes: number;
    assetBytes: number;
  };

  warnings: string[];
  errors: string[];
}
```

Do not enforce tiny arbitrary bundle limits before measurement.

Track changes.

---

# 44. Playwright Configuration

Use separate projects.

```ts
import {
  defineConfig,
  devices
} from "@playwright/test";

export default defineConfig({
  testDir: "./tests",

  fullyParallel: false,

  retries:
    process.env.CI ? 2 : 0,

  reporter: [
    ["list"],
    ["html", {
      open: "never"
    }]
  ],

  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },

  projects: [
    {
      name: "chromium-dev",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173"
      }
    },

    {
      name: "chromium-preview",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173"
      }
    }
  ]
});
```

Use separate commands/web servers rather than running both servers in one ambiguous configuration.

Physics and AI quantitative tests remain serial.

---

# 45. Test Taxonomy

## Unit tests

Pure:

- Math
- Utility scoring
- Deadzones
- State transitions
- Manifest validation
- Event dispatcher
- Contract comparison
- Deterministic PRNG

## Module browser tests

- Physics API
- Input API
- Asset API
- AI API
- Game-flow API

## Integration tests

- Input to physics
- AI to physics
- Physics to game flow
- Game flow to UI
- Physics to VFX
- Assets to renderer
- Pad state to visuals/AI

## Release tests

- Production preview loads
- Main menu
- Start one-minute match
- Countdown
- Goal
- Overtime
- Results
- Replay
- Return to menu
- No fatal console errors
- No remote asset requests

---

# 46. Combined Browser Test API

```ts
declare global {
  interface Window {
    __GAME_TEST__?:
      BrowserCombinedTestApi;
  }
}
```

Combined facade may expose sub-APIs:

```ts
export interface BrowserCombinedTestApi {
  ready(): boolean;

  physics: BrowserPhysicsTestApi;
  input: BrowserInputTestApi;
  ai: BrowserAiTestApi;
  assets: BrowserAssetTestApi;
  gameFlow: BrowserGameTestApi;

  runtime: BrowserRuntimeTestApi;
}
```

Install only when:

```text
__TEST_BUILD__ || __DEV__
```

The production preview release test may use a test-mode production build.

Do not expose mutation APIs in ordinary production build.

---

# 47. Runtime Diagnostics

```ts
export interface RuntimeDiagnostics {
  appState: AppState;
  matchState: MatchState;

  running: boolean;
  fixedTick: number;

  accumulatorSeconds: number;
  droppedFixedTimeSeconds: number;

  frameTimeMs: number;
  fixedStepsLastFrame: number;

  moduleStatus:
    Record<string, ModuleStatus>;

  renderer:
    RendererDiagnostics;

  assets:
    AssetReportSummary;

  subscriptions:
    Record<string, number>;

  errors:
    RuntimeErrorRecord[];
}
```

Diagnostic data is read-only.

---

# 48. Error Boundaries

## Vue error handling

Install:

```ts
app.config.errorHandler = (
  error,
  instance,
  info
) => {
  errorReporter.reportVueError(
    error,
    info
  );
};
```

## Runtime errors

Catch at module boundaries.

Do not catch and ignore.

## RAF errors

Wrap frame body:

```ts
try {
  this.runFrame(...);
} catch (error) {
  this.handleFatalRuntimeError(error);
}
```

On fatal:

- Stop fixed stepping
- Stop input effects
- Show error screen
- Preserve diagnostics

---

# 49. Logging

Use structured logging.

```ts
logger.info(
  "physics.initialised",
  {
    fixedHz: 120
  }
);
```

Levels:

```text
debug
info
warn
error
```

Production:

- Warn/error
- Important startup summaries

Do not print per-tick logs.

---

# 50. Settings Coordination

Settings originate from persisted stores.

On change:

- Input settings -> input module
- Camera settings -> camera module
- Visual settings -> renderer/visual module
- Audio settings -> audio module
- Match defaults -> game-flow setup UI

Use one settings service.

Do not have modules independently read local storage.

---

# 51. Hot Module Replacement

HMR can duplicate listeners and loops if unmanaged.

Requirements:

- Runtime singleton stored safely
- Dispose previous runtime on module replacement
- Input listeners removed
- RAF cancelled
- Three.js resources disposed when full runtime replaced
- Rapier world released
- Test APIs replaced
- Vue state preserved only where safe

Development helper:

```ts
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    gameRuntime.dispose();
  });
}
```

---

# 52. Memory Ownership Matrix

| Resource | Owner | Lifetime |
|---|---|---|
| Vue app | `main.ts` | Application |
| GameRuntime | Core | Application |
| Three renderer | Renderer | Application |
| Rapier world | Physics | Match/application according to design |
| Shared GLB source | Asset pipeline | Application |
| Shared textures | Asset pipeline | Application |
| Stadium geometry | Asset/stadium | Application or presentation |
| Car visual instance | Rendering | Match/menu instance |
| Match VFX | VFX | Match |
| AI planner state | AI | Match |
| Input listeners | Input | Application |
| UI subscriptions | Vue stores | Component/application |
| Test APIs | Test installer | Build lifetime |

---

# 53. Subscription Ownership

Every subscription returns:

```ts
type Unsubscribe = () => void;
```

Module maintains:

```ts
private unsubscribers:
  Unsubscribe[] = [];
```

On dispose:

```ts
for (
  const unsubscribe of
  this.unsubscribers
) {
  unsubscribe();
}
```

Clear array.

Leak tests inspect listener counts.

---

# 54. Sonnet Implementation Strategy

A Sonnet-level model should not attempt the entire final game in one unverified pass.

Use vertical milestones.

Each milestone must:

1. Compile.
2. Pass focused tests.
3. Be manually runnable.
4. Update progress document.
5. Preserve previous tests.

Do not start the next milestone with known failing exit criteria.

---

# 55. Implementation Progress Document

Maintain:

```text
docs/implementation-progress.md
```

Template:

```md
# Current Phase

Phase:
Status:
Last verified commit:

## Working
- ...

## Failing
- ...

## Deferred
- ...

## Tests passing
- ...

## Next exact task
- ...

## Known deviations
- ...
```

The next implementation prompt should read this file first.

---

# 56. Phase 0 — Repository Foundation

Implement:

- Vite + Vue + TypeScript scaffold
- Exact package versions
- Lockfile
- `App.vue`
- `GameCanvas.vue`
- Basic Pinia setup
- Path aliases
- Strict TypeScript
- Vitest
- Playwright
- Build/validate scripts
- Three.js skill installation validation
- Module contract constants
- Empty module interfaces
- Null modules
- Progress docs

Exit criteria:

- `npm ci` succeeds.
- `npm run type-check` succeeds.
- `npm run build` succeeds with placeholder canvas.
- Playwright smoke test loads page.
- Three.js version reports exactly `0.160.0`.
- Missing skill test fails correctly.
- No game logic yet.

Do not begin physics before this passes.

---

# 57. Phase 1 — Core Runtime and Loop

Implement:

- `GameRuntime`
- Runtime singleton
- One RAF
- Fixed-step coordinator
- App state
- Typed event dispatcher
- Module container
- Error reporter
- Runtime diagnostics
- Test runtime API
- Safe disposal
- HMR disposal

Use null modules.

Exit criteria:

- One RAF only.
- Manual fixed-tick stepping works.
- Pause/stop runtime works.
- Dispose removes RAF/listeners.
- Runtime test passes 10,000 empty ticks.
- Vue remains responsive.

---

# 58. Phase 2 — Asset and Procedural Foundation

Implement from asset specification:

- Loading manager
- Manifest
- Skill validation
- Procedural registries
- Procedural fallback car
- Procedural ball
- Basic stadium blockout
- Basic material set
- Basic star background
- Asset test API

Do not wait for user GLBs/textures.

Exit criteria:

- Complete placeholder world renders.
- No external assets required.
- Deterministic seed test passes.
- Asset resources dispose.
- Development menu can show placeholder world.

---

# 59. Phase 3 — Physics Foundation

Implement only foundational physics:

- Rapier initialisation
- Fixed world
- Ball
- Two car bodies
- Flat/blockout arena
- Reset
- Manual stepping
- Physics test API
- Render snapshots
- Speed clamps
- Basic collisions

Do not implement advanced controller yet.

Exit criteria:

- Ball falls and bounces.
- Cars collide with arena.
- Cars collide with each other.
- Both cars contact ball.
- Reset deterministic.
- No NaN.
- Rendering follows snapshots.

---

# 60. Phase 4 — Input Foundation

Implement:

- Keyboard/mouse raw state
- Gamepad virtual provider
- Default mappings
- Logical actions
- Edge queue
- Input contexts
- Basic gamepad support
- Input test API

Connect only to simple car controls as they become available.

Exit criteria:

- Input mapping tests pass.
- No lost jump edges.
- Focus loss neutralises.
- Device disconnect neutralises.
- UI can navigate with keyboard/mouse/gamepad.

---

# 61. Phase 5 — Car Driving and Physics Calibration

Implement physics modules:

- Suspension
- Ground drive
- Brake/coast
- Steering
- Grip
- Powerslide
- Boost
- Jump
- Air control
- Dodge
- Car-ball authored hit
- Car-car tuning

Use procedural car fallback.

Input now controls player.

Opponent remains neutral/scripted.

Exit criteria:

- Player can drive, jump, boost, dodge.
- Car feels testably stable.
- Physics regression suite passes.
- One human can hit ball into goal area.
- No final visuals yet.

This is the first major playability gate.

---

# 62. Phase 6 — Boost Pads

Implement across modules:

- Physics pad sensors
- Pickup and respawn
- 12-small/4-full stadium layout
- Procedural pad visuals
- Pad VFX
- Input/HUD boost integration
- Snapshot/events
- Reset behaviour

Exit criteria:

- Cars begin with 33.
- Pads collect correctly.
- Timers exact.
- Contested claim deterministic.
- Visual state matches physics.
- HUD reflects boost.
- Full match reset restores pads.

---

# 63. Phase 7 — Functional Match Flow

Implement:

- Main menu state
- Match setup
- 1/3/10 selection
- Countdown
- Playing
- Goal sensors
- Score
- Goal latch
- Reset
- Match clock
- Zero-second rule
- Overtime
- Pause
- Results
- Replay
- Return to menu

Use plain Vue UI.

Do not final-polish it.

Exit criteria:

- Automated one-minute match completes.
- Overtime path works.
- Replay works repeatedly.
- Return to menu works.
- Input contexts switch safely.
- No duplicate score.

This is the second major playability gate.

---

# 64. Phase 8 — Camera and Gameplay HUD

Implement:

- Chase camera
- Ball framing
- Camera collision
- Ball-camera toggle
- Rear view
- Camera swivel
- Score/time HUD
- Boost meter
- Countdown overlay
- Pause/results basics

Exit criteria:

- Ball remains visible in normal play.
- Camera does not leave valid space.
- HUD is readable.
- KBM and gamepad controls work through complete match.

---

# 65. Phase 9 — Basic Opponent AI

Implement in strict order:

1. Ground target driving
2. Recovery
3. Ball prediction
4. Reachability
5. Basic intercept
6. Shoot open goal
7. Retreat
8. Basic defence
9. Kickoff
10. Boost-pad collection

Initially one Medium-like parameter set.

Do not implement Easy/Hard separation yet.

Exit criteria:

- AI completes kickoff.
- AI touches moving ball.
- AI can score open goal.
- AI returns toward own goal.
- AI uses pads.
- AI recovers.
- One-minute match against AI works.

---

# 66. Phase 10 — AI Difficulty and Tactics

Add:

- Easy
- Medium
- Hard
- Reaction delay
- Perception uncertainty
- Shadow defence
- Challenge logic
- Clears
- Boost routes
- Limited jumps
- Hard limited aerials
- Humanisation
- Statistical tests

Exit criteria:

- Difficulty ordering holds statistically.
- Medium is viable default.
- Hard is not omniscient.
- Easy remains functional.
- Full-match AI tests pass.

---

# 67. Phase 11 — User Car GLB Integration

When cars are supplied:

- Inventory
- Validate
- Inspect
- Align to hitbox
- Team material adaptation
- Wheel nodes if present
- Boost sockets
- Cache
- Visual regression

Do not change physics merely to fit source model.

Exit criteria:

- Supplied cars replace fallback.
- Team colours independent.
- Two car instances safe.
- No duplicate downloads.
- Bounds/alignment accepted.
- Performance within budget.

---

# 68. Phase 12 — User Texture Integration

When textures are supplied:

- Inventory
- Classify
- Manifest
- Colour spaces
- Filtering
- Apply selectively
- Attribution
- Visual comparisons

Do not apply every texture automatically.

Exit criteria:

- No required texture errors.
- Textures support art direction.
- Pixel output remains readable.
- GPU memory within budget.

---

# 69. Phase 13 — PSX Visual Language

Implement:

- Low-resolution target
- Nearest upscale
- Vertex jitter
- Colour quantisation
- Bayer dither
- Restrained glow
- Palette
- Material roles
- Authentic/balanced/clean presets
- Accessibility reductions

Exit criteria:

- UI unaffected by PSX pass.
- Ball readable.
- Team colours distinct.
- Authentic mode stable.
- Visual screenshots reviewed.

---

# 70. Phase 14 — Stadium Art and VFX

Implement:

- Structural ribs
- Glass layers
- Field markings
- Goal grid
- Floating base
- Starfield layers
- Boost effects
- Jump/slide/impact effects
- Goal celebration
- Menu presentation

Exit criteria:

- Stadium visually complete.
- Goal celebration works.
- Particles pooled.
- Draw-call budget met.
- No transparency failures.
- 60 FPS target.

---

# 71. Phase 15 — UI and Settings Polish

Implement:

- Final menu composition
- Match setup
- Settings categories
- Control rebinding UI
- Controller prompts
- Pause confirmation
- Results presentation
- Loading/error screens
- Accessibility controls
- Persistence

Exit criteria:

- Every screen keyboard navigable.
- Every screen mouse navigable.
- Every screen controller navigable.
- Settings persist.
- Rebinding works.
- Error states actionable.

---

# 72. Phase 16 — Audio Module

A separate audio specification should define details.

At this phase:

- Replace `NullAudioModule`
- Audio context gesture
- Engine
- Boost
- Hits
- UI
- Goal
- Overtime
- Music
- Mix/settings

Exit criteria defined by future audio module.

Audio must not block earlier phases.

---

# 73. Phase 17 — Integration Hardening

Run:

- Full match loops
- Repeated replay
- Pause/resume
- Device switching
- Controller disconnect
- Asset failures
- Context loss if implemented
- Memory tests
- Long soak
- AI statistical tests
- Visual snapshots
- Production preview tests

Fix:

- Leaks
- Race conditions
- State duplication
- Event subscription errors
- Build warnings
- Performance regressions

---

# 74. Phase 18 — Final Build Gate

Required:

```bash
npm ci
npm run validate
npm run type-check
npm run test:unit
npm run build:app
npm run test:e2e:preview
npm run report:assets
npm run report:build
```

Release acceptance:

- Clean install
- Clean build
- No required-asset failure
- No TypeScript errors
- No fatal console errors
- Main menu opens
- One-minute match completes
- Goal, reset, overtime, results work
- Replay works
- AI works
- KBM works
- Virtual/physical gamepad path works
- Resource counts stabilise
- Build reports generated

Deployment remains out of scope.

---

# 75. Work Chunking for a Sonnet-Level LLM

Each implementation request should contain one bounded goal.

Good:

```text
Implement Phase 3 ball rigid body and deterministic
ball-drop Playwright test. Do not implement car controls.
```

Bad:

```text
Build the complete game.
```

Recommended chunk size:

- One subsystem
- Its public interfaces
- Its focused tests
- Its debug exposure
- Its progress update

Each chunk should end with:

```text
Files changed
Tests run
Tests passing
Known limitations
Next exact task
```

---

# 76. Phase Prompt Template

```md
You are implementing Phase X of the game.

Read:
- Core architecture specification
- Relevant module specification
- docs/implementation-progress.md
- Relevant Three.js skills where applicable

Scope:
- ...

Do not implement:
- ...

Required files:
- ...

Required tests:
- ...

Exit criteria:
- ...

After implementation:
1. Run type-check.
2. Run focused tests.
3. Update implementation progress.
4. Record deviations.
5. Do not proceed to the next phase.
```

---

# 77. Avoiding LLM Scope Creep

Before code changes, the LLM must state internally:

- Current phase
- Exact exit criterion
- Files expected
- Modules not to touch

Reject unrelated work.

Examples:

- Do not polish menu while debugging suspension.
- Do not add audio while implementing AI.
- Do not change Three.js version to solve shader mistake.
- Do not change physics constants to solve visual alignment.
- Do not add a router because menus feel complex.
- Do not add ECS framework midway.
- Do not add state-machine library unless existing typed state is insufficient.

---

# 78. Integration Checkpoints

## Checkpoint A — Technical skeleton

After Phase 1:

- Build reliable
- Runtime reliable
- No gameplay

## Checkpoint B — Physics playground

After Phase 6:

- Human controls car
- Ball and pads work
- No match flow required

## Checkpoint C — Playable ugly game

After Phase 8:

- Full match playable
- Placeholder art
- Basic AI may still be absent

## Checkpoint D — Complete gameplay

After Phase 10:

- Human versus AI
- All rules
- All controls
- Boost pads

## Checkpoint E — Content complete

After Phase 14:

- Supplied cars/textures
- PSX visuals
- Stadium/VFX

## Checkpoint F — Product complete

After Phase 18:

- UI/settings/audio
- Build and tests stable

Do not confuse visual incompleteness at Checkpoint C with architectural failure.

---

# 79. Branch and Commit Guidance

Even for a one-shot build, commits should align with phases.

Examples:

```text
chore: scaffold vite vue runtime
feat: add deterministic fixed-step coordinator
feat: add rapier ball and arena foundation
feat: add keyboard and gamepad input
feat: add car suspension and drive
feat: add boost pads
feat: add match flow
feat: add predictive opponent ai
feat: integrate supplied car glb
feat: add psx render pipeline
```

Do not commit generated test output unless required.

---

# 80. Build Failure Triage

## Type-check failure

1. Fix types.
2. Do not use `any` broadly.
3. Do not disable strictness.
4. Re-run focused tests.

## Vite build failure

1. Inspect first root error.
2. Check addon import path.
3. Check WASM/GLB asset handling.
4. Check browser/node boundary.
5. Do not randomly downgrade packages.

## Shader build/runtime failure

1. Read Three.js shader skill.
2. Capture shader source.
3. Check `ShaderMaterial` versus `RawShaderMaterial`.
4. Check duplicate version/precision declarations.
5. Run isolated shader test.

## Rapier import failure

1. Confirm compat package version.
2. Confirm async initialisation.
3. Check bundler chunk.
4. Do not replace physics engine.

## Vue reactivity performance issue

1. Check hot state accidentally stored in Pinia.
2. Check Three objects made reactive.
3. Check HUD update frequency.
4. Check component rerenders.

---

# 81. Browser Compatibility Target

Initial required browser:

```text
Desktop Chromium
```

Best-effort after release gate:

- Firefox
- WebKit

Playwright quantitative physics tests should run primarily in Chromium for stable calibration.

Cross-browser smoke tests may be added after core stability.

Do not block first complete implementation on perfect cross-browser parity.

---

# 82. Resize and Display Integration

Renderer receives canvas size.

Use `ResizeObserver` from `GameCanvas.vue`.

On resize:

- Update display renderer size
- Update camera aspect
- Preserve internal low-resolution preset
- Update post-processing targets
- Preserve UI native resolution
- Avoid rebuilding scene

Do not read layout every frame.

---

# 83. WebGL Context Handling

Initial requirement:

- Detect context lost
- Stop rendering safely
- Display recovery/error overlay
- Prevent default if attempting restoration
- Recreate renderer resources only if architecture supports it

A complete automatic restoration system may be deferred.

Do not let context loss produce endless exceptions.

---

# 84. Performance Coordination

Budgets from modules remain authoritative.

Core tracks:

- Frame time
- Fixed steps
- Draw calls
- Triangles
- Textures
- Geometries
- AI time
- Prediction time
- Physics time
- VFX time
- HUD update time

Development overlay displays totals.

Do not profile only average FPS.

Track spikes.

---

# 85. Production Build Flags

Use compile-time flags:

```ts
declare const __DEV__: boolean;
declare const __TEST_BUILD__: boolean;
```

Guard test APIs:

```ts
if (__DEV__ || __TEST_BUILD__) {
  installTestApis(...);
}
```

Guard expensive diagnostics:

```ts
if (__DEV__) {
  telemetry.recordDetailed(...);
}
```

Do not rely only on runtime URL parameters to hide mutation APIs.

---

# 86. No Deployment Scope

This document intentionally excludes:

- Hosting platform
- Domain
- CDN
- Cache-control headers
- Service worker
- PWA
- Installer
- Server
- Analytics
- Authentication
- Cloud saves
- Multiplayer backend

Build output must be valid.

Where it is hosted is a later decision.

---

# 87. Required Documentation Set

```text
docs/
├─ implementation-progress.md
├─ integration-deviations.md
├─ build-decisions.md
├─ architecture.md
├─ module-contracts.md
├─ threejs-skill-usage-log.md
├─ asset-attribution.md
├─ car-intake-report.md
├─ texture-intake-report.md
├─ physics-deviations.md
├─ calibration-log.md
├─ ai-calibration-log.md
├─ input-calibration-log.md
├─ procedural-asset-calibration-log.md
└─ playtest-log.md
```

`architecture.md` may summarise this specification for developers.

Do not duplicate the entire spec unnecessarily.

---

# 88. Definition of Done

Build:

- [ ] Vite
- [ ] Vue 3
- [ ] TypeScript strict
- [ ] Exact versions
- [ ] package-lock committed
- [ ] `npm ci` works
- [ ] Validation scripts
- [ ] Type-check
- [ ] Unit tests
- [ ] Vite production build
- [ ] Preview test
- [ ] Build report
- [ ] No deployment work required

Three.js:

- [ ] Exactly `0.160.0`
- [ ] No `@types/three`
- [ ] `three/addons/` imports
- [ ] All skills installed
- [ ] Skills validation
- [ ] Skill usage log
- [ ] Upgrade process documented

Vue:

- [ ] UI only
- [ ] One canvas component
- [ ] No simulation in components
- [ ] No Three/Rapier hot objects in Pinia
- [ ] Low-frequency serialisable stores
- [ ] Loading/error UI
- [ ] Settings integration

Runtime:

- [ ] One GameRuntime
- [ ] One RAF
- [ ] One physics step location
- [ ] Fixed 120 Hz
- [ ] Typed events
- [ ] Commands distinct from events
- [ ] Module container
- [ ] Lifecycle/disposal
- [ ] HMR safety
- [ ] Diagnostics

Integration:

- [ ] Input to player physics
- [ ] AI to opponent physics
- [ ] Physics to renderer
- [ ] Physics to game flow
- [ ] Physics to VFX/audio
- [ ] Stadium to physics/render/AI/camera
- [ ] Assets to renderer
- [ ] Game flow to Vue
- [ ] Settings to modules
- [ ] Contract validation

Sequencing:

- [ ] Progress document
- [ ] Phase exit criteria
- [ ] Vertical checkpoints
- [ ] Placeholders explicitly identified
- [ ] No advanced work before foundations
- [ ] Complete release gate

---

# 89. Final Architecture

```text
Vue application
├─ Menus
├─ HUD
├─ Settings
├─ Loading/error
└─ Debug controls
          |
          | commands and serialisable state
          v
GameRuntime
├─ Module container
├─ Fixed-step coordinator
├─ Frame coordinator
├─ Typed event dispatcher
├─ Error reporter
└─ Diagnostics
          |
   +------+------+------+------+------+
   |      |      |      |      |      |
   v      v      v      v      v      v
 Input  Physics  AI   Assets  Game   Audio
                         |     Flow   placeholder
                         |
                         v
             Three.js rendering system
             ├─ Stadium
             ├─ Cars
             ├─ Ball
             ├─ Boost pads
             ├─ VFX
             ├─ Camera
             └─ PSX pipeline
```

Build path:

```text
npm ci
-> validate contracts
-> validate Three.js skills
-> validate assets
-> validate architecture
-> strict Vue/TypeScript check
-> unit tests
-> Vite production build
-> Playwright preview tests
-> reports
```

Implementation path:

```text
Repository
-> Runtime
-> Procedural assets
-> Physics foundation
-> Input
-> Car mechanics
-> Boost pads
-> Match flow
-> Camera/HUD
-> Basic AI
-> Advanced AI
-> Supplied cars
-> Supplied textures
-> PSX visuals
-> Stadium/VFX
-> UI polish
-> Audio
-> Integration hardening
-> Final build
```

The intended outcome is a project that a Sonnet-level LLM can implement incrementally without losing architectural control, rebuilding subsystems unnecessarily, or attempting the final aesthetic before the game is mechanically complete.
